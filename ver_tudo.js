const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./amigo_oculto_v2.db');

const sql = `
    SELECT 
        s.titulo AS Sorteio,
        u1.nome AS Participante,
        u2.nome AS Tirou_Amigo
    FROM participantes p
    JOIN usuarios u1 ON p.usuario_id = u1.id
    LEFT JOIN usuarios u2 ON p.amigo_secreto_id = u2.id
    JOIN sorteios s ON p.sorteio_id = s.id
    ORDER BY s.titulo, u1.nome;
`;

db.all(sql, [], (err, rows) => {
    if (err) {
        console.error(err);
    } else {
        // console.table deixa a visualização linda no terminal
        console.table(rows); 
    }
    db.close();
});