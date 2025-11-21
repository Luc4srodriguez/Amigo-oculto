const API_URL = '/api';
let currentUser = null;

// --- AUTENTICAÇÃO ---
function toggleAuth(tab) {
    document.getElementById('form-login').style.display = tab === 'login' ? 'block' : 'none';
    document.getElementById('form-cadastro').style.display = tab === 'cadastro' ? 'block' : 'none';
    document.getElementById('tab-login').className = tab === 'login' ? 'active' : '';
    document.getElementById('tab-cad').className = tab === 'cadastro' ? 'active' : '';
}

async function cadastrar() {
    const nome = document.getElementById('cad-nome').value;
    const senha = document.getElementById('cad-senha').value;

    if (!nome || !senha) return alert("Preencha tudo!");

    const res = await fetch(`${API_URL}/cadastro`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ nome, senha })
    });
    
    const data = await res.json();
    if(res.ok) { 
        alert("Cadastro com sucesso!"); 
        toggleAuth('login'); 
    } else {
        alert(data.erro);
    }
}

async function login() {
    const nome = document.getElementById('login-nome').value;
    const senha = document.getElementById('login-senha').value;

    if (!nome || !senha) return alert("Preencha tudo!");

    const res = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ nome, senha })
    });
    
    const data = await res.json();
    if(res.ok) {
        currentUser = data;
        carregarApp();
    } else {
        alert(data.erro);
    }
}

function logout() {
    currentUser = null;
    document.getElementById('app-screen').style.display = 'none';
    document.getElementById('details-screen').style.display = 'none';
    document.getElementById('auth-screen').style.display = 'flex';
}

// --- APP & NAVEGAÇÃO ---
function carregarApp() {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app-screen').style.display = 'block';
    document.getElementById('user-name-display').innerText = currentUser.nome;
    carregarMeusSorteios();
}

function voltarDashboard() {
    document.getElementById('details-screen').style.display = 'none';
    document.getElementById('app-screen').style.display = 'block';
    carregarMeusSorteios();
}

// --- DASHBOARD ---
async function carregarMeusSorteios() {
    const res = await fetch(`${API_URL}/meus-sorteios/${currentUser.id}`);
    const sorteios = await res.json();
    const container = document.getElementById('cards-container');
    container.innerHTML = '';

    sorteios.forEach(s => {
        const dataF = new Date(s.data_limite).toLocaleString('pt-BR');
        const statusClass = s.status === 'Aberto' ? 'status-aberto' : 'status-fechado';
        
        // Ao clicar, vai para detalhes
        const card = `
            <div class="card" onclick="verDetalhes(${s.id})">
                <h3>${s.titulo}</h3>
                <p class="card-desc">${s.descricao}</p>
                <p class="card-date">Data limite: ${dataF}</p>
                <div style="margin-top:10px;">
                    <span class="card-status ${statusClass}">${s.status}</span>
                </div>
            </div>
        `;
        container.innerHTML += card;
    });
}

// --- TELA DE DETALHES ---
async function verDetalhes(id) {
    document.getElementById('app-screen').style.display = 'none';
    document.getElementById('details-screen').style.display = 'block';

    const res = await fetch(`${API_URL}/sorteio/${id}/detalhes`);
    const data = await res.json();
    const s = data.sorteio;
    const parts = data.participantes;

    // Preencher Infos
    document.getElementById('detail-title').innerText = s.titulo;
    document.getElementById('detail-date').innerText = new Date(s.data_limite).toLocaleString('pt-BR');
    document.getElementById('detail-code').innerText = s.codigo_convite;
    document.getElementById('detail-count').innerText = `${parts.length} participante(s)`;

    const badge = document.getElementById('detail-status-badge');
    badge.innerText = s.status;
    badge.className = `status-badge ${s.status === 'Aberto' ? 'status-aberto' : 'status-fechado'}`;

    // Lista Participantes
    const listContainer = document.getElementById('participants-list');
    listContainer.innerHTML = '';
    if(parts.length === 0) {
        listContainer.innerHTML = '<p class="empty-msg">Nenhum participante ainda</p>';
    } else {
        parts.forEach(p => {
            listContainer.innerHTML += `<div class="participant-item">${p.nome}</div>`;
        });
    }

    // Ações e Resultado
    const actionDiv = document.getElementById('detail-actions');
    const resultArea = document.getElementById('my-result-area');
    actionDiv.innerHTML = '';
    resultArea.style.display = 'none';

    if (s.status === 'Aberto') {
        if (s.dono_id === currentUser.id) {
            actionDiv.innerHTML = `
                <button onclick="realizarSorteioNaTela(${s.id})" class="btn-action-card">
                   🎲 Realizar Sorteio
                </button>`;
        } else {
            actionDiv.innerHTML = `<span style="color:#aaa; font-size:0.9rem">Aguardando o dono sortear...</span>`;
        }
    } else {
        // Se fechado, buscar resultado
        const resAmigo = await fetch(`${API_URL}/resultado/${s.id}/${currentUser.id}`);
        const dataAmigo = await resAmigo.json();
        
        if(dataAmigo.amigo) {
            resultArea.style.display = 'block';
            document.getElementById('result-name').innerText = dataAmigo.amigo;
        }
    }
}

// --- MODAIS & AÇÕES ---
function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

async function criarSorteio() {
    const titulo = document.getElementById('new-title').value;
    const descricao = document.getElementById('new-desc').value;
    const data_limite = document.getElementById('new-date').value;

    if(!titulo || !data_limite) return alert("Preencha os dados!");

    const res = await fetch(`${API_URL}/sorteios`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ titulo, descricao, data_limite, dono_id: currentUser.id })
    });

    if(res.ok) {
        closeModal('modal-novo');
        carregarMeusSorteios();
    }
}

async function entrarSorteio() {
    const codigo = document.getElementById('invite-code').value.toUpperCase();
    
    const res = await fetch(`${API_URL}/entrar-sorteio`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ usuario_id: currentUser.id, codigo })
    });

    const data = await res.json();
    if(res.ok) {
        alert("Você entrou no sorteio!");
        closeModal('modal-entrar');
        carregarMeusSorteios();
    } else {
        alert(data.erro);
    }
}

async function realizarSorteioNaTela(id) {
    if(!confirm("Deseja realizar o sorteio agora? O grupo será fechado.")) return;
    
    const res = await fetch(`${API_URL}/realizar-sorteio/${id}`, { method: 'POST' });
    const data = await res.json();
    
    if(res.ok) {
        alert("Sorteio Realizado com Sucesso!");
        verDetalhes(id); // Atualiza a tela para ver o resultado
    } else {
        alert(data.erro);
    }
}