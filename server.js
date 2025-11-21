const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const app = express();
const db = new sqlite3.Database('./amigo_oculto_v2.db');

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- BANCO DE DADOS ---
db.serialize(() => {
    // Tabela de Usuários (Login apenas com Nome)
    db.run(`CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT UNIQUE,
        senha TEXT
    )`);

    // Tabela de Sorteios
    db.run(`CREATE TABLE IF NOT EXISTS sorteios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        titulo TEXT,
        descricao TEXT,
        data_limite TEXT,
        status TEXT DEFAULT 'Aberto',
        codigo_convite TEXT UNIQUE,
        dono_id INTEGER
    )`);

    // Tabela de Participantes
    db.run(`CREATE TABLE IF NOT EXISTS participantes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER,
        sorteio_id INTEGER,
        amigo_secreto_id INTEGER,
        FOREIGN KEY(usuario_id) REFERENCES usuarios(id),
        FOREIGN KEY(sorteio_id) REFERENCES sorteios(id)
    )`);
});

// --- ROTAS ---

// 1. Cadastro e Login
app.post('/api/cadastro', (req, res) => {
    const { nome, senha } = req.body;
    db.run(`INSERT INTO usuarios (nome, senha) VALUES (?, ?)`, [nome, senha], function(err) {
        if (err) return res.status(400).json({ erro: "Este nome já está em uso!" });
        res.json({ id: this.lastID, nome });
    });
});

app.post('/api/login', (req, res) => {
    const { nome, senha } = req.body;
    db.get(`SELECT id, nome FROM usuarios WHERE nome = ? AND senha = ?`, [nome, senha], (err, row) => {
        if (!row) return res.status(401).json({ erro: "Usuário ou senha incorretos" });
        res.json(row);
    });
});

// 2. Criar Sorteio
app.post('/api/sorteios', (req, res) => {
    const { titulo, descricao, data_limite, dono_id } = req.body;
    const codigo = Math.random().toString(36).substring(2, 8).toUpperCase();

    db.run(`INSERT INTO sorteios (titulo, descricao, data_limite, dono_id, codigo_convite) VALUES (?, ?, ?, ?, ?)`, 
        [titulo, descricao, data_limite, dono_id, codigo], 
        function(err) {
            if (err) return res.status(500).json({ erro: err.message });
            
            // O dono entra automaticamente
            const sorteioId = this.lastID;
            db.run(`INSERT INTO participantes (usuario_id, sorteio_id) VALUES (?, ?)`, [dono_id, sorteioId]);
            
            res.json({ sucesso: true, codigo });
    });
});

// 3. Listar Meus Sorteios (Dashboard)
app.get('/api/meus-sorteios/:usuario_id', (req, res) => {
    const sql = `
        SELECT s.*, 
        (SELECT COUNT(*) FROM participantes p WHERE p.sorteio_id = s.id) as total_participantes
        FROM sorteios s
        JOIN participantes p ON s.id = p.sorteio_id
        WHERE p.usuario_id = ?
    `;
    db.all(sql, [req.params.usuario_id], (err, rows) => {
        res.json(rows);
    });
});

// 4. Entrar em Sorteio (Via código)
app.post('/api/entrar-sorteio', (req, res) => {
    const { usuario_id, codigo } = req.body;
    
    db.get("SELECT id FROM sorteios WHERE codigo_convite = ?", [codigo], (err, sorteio) => {
        if (!sorteio) return res.status(404).json({ erro: "Código inválido!" });

        db.get("SELECT id FROM participantes WHERE usuario_id = ? AND sorteio_id = ?", [usuario_id, sorteio.id], (err, row) => {
            if (row) return res.status(400).json({ erro: "Você já está neste sorteio." });

            db.run(`INSERT INTO participantes (usuario_id, sorteio_id) VALUES (?, ?)`, [usuario_id, sorteio.id], function(err) {
                res.json({ sucesso: true });
            });
        });
    });
});

// 5. Detalhes do Sorteio (Para a nova tela)
app.get('/api/sorteio/:id/detalhes', (req, res) => {
    const sorteioId = req.params.id;

    db.get("SELECT * FROM sorteios WHERE id = ?", [sorteioId], (err, sorteio) => {
        if (!sorteio) return res.status(404).json({ erro: "Sorteio não encontrado" });

        const sqlParticipantes = `
            SELECT u.nome 
            FROM participantes p 
            JOIN usuarios u ON p.usuario_id = u.id 
            WHERE p.sorteio_id = ?
        `;

        db.all(sqlParticipantes, [sorteioId], (err, participantes) => {
            res.json({
                sorteio: sorteio,
                participantes: participantes || []
            });
        });
    });
});

// 6. Realizar Sorteio (Embaralhar)
app.post('/api/realizar-sorteio/:sorteio_id', (req, res) => {
    const sorteioId = req.params.sorteio_id;

    db.all("SELECT id, usuario_id FROM participantes WHERE sorteio_id = ?", [sorteioId], (err, rows) => {
        if (rows.length < 2) return res.status(400).json({ erro: "Precisa de pelo menos 2 pessoas!" });

        let participantes = rows.map(p => p.usuario_id);
        let sorteados = [...participantes];
        
        // Algoritmo para garantir que ninguém se tire
        let valido = false;
        while (!valido) {
            sorteados.sort(() => Math.random() - 0.5);
            valido = true;
            for (let i = 0; i < participantes.length; i++) {
                if (participantes[i] === sorteados[i]) {
                    valido = false;
                    break;
                }
            }
        }

        db.serialize(() => {
            db.run("BEGIN TRANSACTION");
            for (let i = 0; i < participantes.length; i++) {
                db.run(`UPDATE participantes SET amigo_secreto_id = ? WHERE usuario_id = ? AND sorteio_id = ?`, 
                    [sorteados[i], participantes[i], sorteioId]);
            }
            db.run(`UPDATE sorteios SET status = 'Fechado' WHERE id = ?`, [sorteioId]);
            db.run("COMMIT");
        });

        res.json({ sucesso: true });
    });
});

// 7. Ver Resultado Individual
app.get('/api/resultado/:sorteio_id/:usuario_id', (req, res) => {
    const { sorteio_id, usuario_id } = req.params;
    db.get(`
        SELECT amigo.nome as amigo_nome 
        FROM participantes p 
        JOIN usuarios amigo ON p.amigo_secreto_id = amigo.id 
        WHERE p.usuario_id = ? AND p.sorteio_id = ?
    `, [usuario_id, sorteio_id], (err, row) => {
        if(row) res.json({ amigo: row.amigo_nome });
        else res.json({ amigo: null });
    });
});

app.listen(3000, () => console.log('🚀 Servidor rodando na porta 3000'));