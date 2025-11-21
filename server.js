require('dotenv').config();

const express = require('express');
const { Pool } = require('pg'); // AQUI: Usamos PG em vez de SQLite
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const app = express();

// Conexão com o Banco Neon usando a variável do Render
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Obrigatório para o Neon
});

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- INICIALIZAÇÃO DO BANCO ---
const initDB = async () => {
    try {
        // Cria as tabelas se não existirem (Sintaxe PostgreSQL)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id SERIAL PRIMARY KEY,
                nome TEXT UNIQUE,
                senha TEXT
            );
        `);
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS sorteios (
                id SERIAL PRIMARY KEY,
                titulo TEXT,
                descricao TEXT,
                data_limite TEXT,
                status TEXT DEFAULT 'Aberto',
                codigo_convite TEXT UNIQUE,
                dono_id INTEGER
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS participantes (
                id SERIAL PRIMARY KEY,
                usuario_id INTEGER REFERENCES usuarios(id),
                sorteio_id INTEGER REFERENCES sorteios(id),
                amigo_secreto_id INTEGER,
                CONSTRAINT unique_participante UNIQUE (usuario_id, sorteio_id)
            );
        `);
        console.log("✅ Banco de dados Neon conectado!");
    } catch (err) {
        console.error("❌ Erro ao conectar no banco:", err);
    }
};
initDB();

// --- ROTAS ---

// 1. Cadastro
app.post('/api/cadastro', async (req, res) => {
    const { nome, senha } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO usuarios (nome, senha) VALUES ($1, $2) RETURNING id, nome`, 
            [nome, senha]
        );
        res.json(result.rows[0]);
    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ erro: "Nome já em uso!" });
        res.status(500).json({ erro: err.message });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    const { nome, senha } = req.body;
    try {
        const result = await pool.query(
            `SELECT id, nome FROM usuarios WHERE nome = $1 AND senha = $2`, 
            [nome, senha]
        );
        if (result.rows.length === 0) return res.status(401).json({ erro: "Login incorreto" });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

// 2. Criar Sorteio
app.post('/api/sorteios', async (req, res) => {
    const { titulo, descricao, data_limite, dono_id } = req.body;
    const codigo = Math.random().toString(36).substring(2, 8).toUpperCase();

    try {
        const result = await pool.query(
            `INSERT INTO sorteios (titulo, descricao, data_limite, dono_id, codigo_convite) 
             VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [titulo, descricao, data_limite, dono_id, codigo]
        );
        
        // Dono entra automaticamente
        await pool.query(
            `INSERT INTO participantes (usuario_id, sorteio_id) VALUES ($1, $2)`, 
            [dono_id, result.rows[0].id]
        );

        res.json({ sucesso: true, codigo });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

// 3. Listar Meus Sorteios
app.get('/api/meus-sorteios/:usuario_id', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT s.*, 
            (SELECT COUNT(*) FROM participantes p WHERE p.sorteio_id = s.id)::int as total_participantes
            FROM sorteios s
            JOIN participantes p ON s.id = p.sorteio_id
            WHERE p.usuario_id = $1
        `, [req.params.usuario_id]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

// 4. Entrar em Sorteio
app.post('/api/entrar-sorteio', async (req, res) => {
    const { usuario_id, codigo } = req.body;
    try {
        const sorteioRes = await pool.query("SELECT id FROM sorteios WHERE codigo_convite = $1", [codigo]);
        if (sorteioRes.rows.length === 0) return res.status(404).json({ erro: "Código inválido!" });

        await pool.query(
            `INSERT INTO participantes (usuario_id, sorteio_id) VALUES ($1, $2)`, 
            [usuario_id, sorteioRes.rows[0].id]
        );
        res.json({ sucesso: true });
    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ erro: "Já participa!" });
        res.status(500).json({ erro: err.message });
    }
});

// 5. Detalhes
app.get('/api/sorteio/:id/detalhes', async (req, res) => {
    try {
        const sorteio = await pool.query("SELECT * FROM sorteios WHERE id = $1", [req.params.id]);
        if (sorteio.rows.length === 0) return res.status(404).json({ erro: "Não encontrado" });

        const parts = await pool.query(`
            SELECT u.nome FROM participantes p 
            JOIN usuarios u ON p.usuario_id = u.id 
            WHERE p.sorteio_id = $1
        `, [req.params.id]);

        res.json({ sorteio: sorteio.rows[0], participantes: parts.rows });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

// 6. Realizar Sorteio (Com Transação)
app.post('/api/realizar-sorteio/:sorteio_id', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const partsRes = await client.query("SELECT id, usuario_id FROM participantes WHERE sorteio_id = $1", [req.params.sorteio_id]);
        
        let participantes = partsRes.rows.map(p => p.usuario_id);
        if (participantes.length < 2) throw new Error("Mínimo 2 pessoas!");

        let sorteados = [...participantes];
        let valido = false;
        while (!valido) {
            sorteados.sort(() => Math.random() - 0.5);
            valido = true;
            for (let i = 0; i < participantes.length; i++) if (participantes[i] === sorteados[i]) valido = false;
        }

        for (let i = 0; i < participantes.length; i++) {
            await client.query(
                `UPDATE participantes SET amigo_secreto_id = $1 WHERE usuario_id = $2 AND sorteio_id = $3`,
                [sorteados[i], participantes[i], req.params.sorteio_id]
            );
        }
        await client.query("UPDATE sorteios SET status = 'Fechado' WHERE id = $1", [req.params.sorteio_id]);
        await client.query('COMMIT');
        res.json({ sucesso: true });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(400).json({ erro: err.message });
    } finally {
        client.release();
    }
});

// 7. Resultado Individual
app.get('/api/resultado/:sorteio_id/:usuario_id', async (req, res) => {
    try {
        const resDb = await pool.query(`
            SELECT amigo.nome as amigo_nome 
            FROM participantes p 
            JOIN usuarios amigo ON p.amigo_secreto_id = amigo.id 
            WHERE p.usuario_id = $1 AND p.sorteio_id = $2
        `, [req.params.usuario_id, req.params.sorteio_id]);
        
        res.json({ amigo: resDb.rows.length > 0 ? resDb.rows[0].amigo_nome : null });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));