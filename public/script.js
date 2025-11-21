const API_URL = '/api'; // Para Render.com
// const API_URL = 'http://localhost:3000/api'; // Para Localhost

let currentUser = null;

// --- UI HELPERS ---

// Mostrar Notificação Bonita (Toast)
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation';
    
    toast.innerHTML = `
        <i class="fa-solid ${icon}"></i>
        <span>${message}</span>
    `;
    
    container.appendChild(toast);

    // Remove após 4 segundos
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// Botão carregando
function setLoading(btnId, isLoading) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    
    if (isLoading) {
        btn.dataset.originalText = btn.innerHTML;
        btn.innerHTML = `<span class="btn-loader"></span> Processando...`;
        btn.disabled = true;
    } else {
        btn.innerHTML = btn.dataset.originalText;
        btn.disabled = false;
    }
}

// --- AUTH ---
function toggleAuth(tab) {
    document.getElementById('form-login').style.display = tab === 'login' ? 'block' : 'none';
    document.getElementById('form-cadastro').style.display = tab === 'cadastro' ? 'block' : 'none';
    document.getElementById('tab-login').className = tab === 'login' ? 'active' : '';
    document.getElementById('tab-cad').className = tab === 'cadastro' ? 'active' : '';
}

async function cadastrar() {
    const nome = document.getElementById('cad-nome').value;
    const senha = document.getElementById('cad-senha').value;

    if (!nome || !senha) return showToast("Preencha todos os campos!", "error");

    setLoading('btn-cad', true);

    try {
        const res = await fetch(`${API_URL}/cadastro`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ nome, senha })
        });
        
        const data = await res.json();
        setLoading('btn-cad', false);

        if(res.ok) { 
            showToast("Cadastro realizado com sucesso! Faça login."); 
            toggleAuth('login'); 
            document.getElementById('cad-nome').value = '';
            document.getElementById('cad-senha').value = '';
        } else {
            showToast(data.erro, "error");
        }
    } catch (error) {
        setLoading('btn-cad', false);
        showToast("Erro de conexão.", "error");
    }
}

async function login() {
    const nome = document.getElementById('login-nome').value;
    const senha = document.getElementById('login-senha').value;

    if (!nome || !senha) return showToast("Preencha login e senha!", "error");

    setLoading('btn-login', true);

    try {
        const res = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ nome, senha })
        });
        
        const data = await res.json();
        setLoading('btn-login', false);

        if(res.ok) {
            currentUser = data;
            showToast(`Bem-vindo, ${data.nome}!`);
            carregarApp();
        } else {
            showToast(data.erro, "error");
        }
    } catch (error) {
        setLoading('btn-login', false);
        showToast("Erro ao conectar no servidor.", "error");
    }
}

function logout() {
    currentUser = null;
    document.getElementById('app-screen').style.display = 'none';
    document.getElementById('details-screen').style.display = 'none';
    document.getElementById('auth-screen').style.display = 'flex';
    showToast("Você saiu da conta.");
}

// --- APP ---
function carregarApp() {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app-screen').style.display = 'block';
    document.getElementById('user-name-display').innerText = currentUser.nome;
    document.getElementById('avatar-initial').innerText = currentUser.nome.charAt(0).toUpperCase();
    carregarMeusSorteios();
}

function voltarDashboard() {
    document.getElementById('details-screen').style.display = 'none';
    document.getElementById('app-screen').style.display = 'block';
    carregarMeusSorteios();
}

async function carregarMeusSorteios() {
    const container = document.getElementById('cards-container');
    const loader = document.getElementById('loading-cards');
    
    container.innerHTML = '';
    loader.style.display = 'block';

    try {
        const res = await fetch(`${API_URL}/meus-sorteios/${currentUser.id}`);
        const sorteios = await res.json();
        
        loader.style.display = 'none';

        if(sorteios.length === 0) {
            container.innerHTML = `<p style="color:#aaa; grid-column: 1/-1; text-align:center;">Você ainda não tem sorteios.</p>`;
            return;
        }

        sorteios.forEach(s => {
            const dataF = new Date(s.data_limite).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
            const isAberto = s.status === 'Aberto';
            
            const card = `
                <div class="card" onclick="verDetalhes(${s.id})">
                    <div class="card-header">
                        <h3>${s.titulo}</h3>
                    </div>
                    <p class="card-desc">${s.descricao}</p>
                    <div class="card-footer">
                        <span class="status-text ${isAberto ? 'status-aberto' : 'status-fechado'}">
                            <span class="status-dot"></span>${s.status}
                        </span>
                        <small style="color:#666"><i class="fa-regular fa-clock"></i> ${dataF}</small>
                    </div>
                </div>
            `;
            container.innerHTML += card;
        });
    } catch (error) {
        loader.style.display = 'none';
        showToast("Erro ao carregar sorteios", "error");
    }
}

async function verDetalhes(id) {
    document.getElementById('app-screen').style.display = 'none';
    document.getElementById('details-screen').style.display = 'block';

    try {
        const res = await fetch(`${API_URL}/sorteio/${id}/detalhes`);
        const data = await res.json();
        const s = data.sorteio;
        const parts = data.participantes;

        document.getElementById('detail-title').innerText = s.titulo;
        document.getElementById('detail-date').innerText = new Date(s.data_limite).toLocaleDateString('pt-BR');
        document.getElementById('detail-code').innerText = s.codigo_convite;
        document.getElementById('detail-count').innerText = parts.length;

        const badge = document.getElementById('detail-status-badge');
        badge.innerText = s.status;
        badge.style.color = s.status === 'Aberto' ? 'var(--success)' : 'var(--danger)';
        badge.style.borderColor = s.status === 'Aberto' ? 'var(--success)' : 'var(--danger)';

        // Lista Participantes
        const listContainer = document.getElementById('participants-list');
        listContainer.innerHTML = '';
        if(parts.length === 0) {
            listContainer.innerHTML = '<p style="color:#666; text-align:center; padding:20px">Nenhum participante ainda.</p>';
        } else {
            parts.forEach(p => {
                listContainer.innerHTML += `
                    <div class="participant-item">
                        <i class="fa-solid fa-user"></i>
                        <span>${p.nome}</span>
                    </div>`;
            });
        }

        // Botões
        const actionDiv = document.getElementById('detail-actions');
        const resultArea = document.getElementById('my-result-area');
        actionDiv.innerHTML = '';
        resultArea.style.display = 'none';

        if (s.status === 'Aberto') {
            if (s.dono_id === currentUser.id) {
                actionDiv.innerHTML = `
                    <button onclick="realizarSorteioNaTela(${s.id})" class="btn-primary" style="width:100%">
                       <i class="fa-solid fa-dice"></i> Realizar Sorteio Agora
                    </button>`;
            } else {
                actionDiv.innerHTML = `<p style="text-align:center; color:#666; font-size:0.9rem"><i class="fa-solid fa-hourglass"></i> Aguardando o organizador...</p>`;
            }
        } else {
            const resAmigo = await fetch(`${API_URL}/resultado/${s.id}/${currentUser.id}`);
            const dataAmigo = await resAmigo.json();
            
            if(dataAmigo.amigo) {
                resultArea.style.display = 'block';
                document.getElementById('result-name').innerText = dataAmigo.amigo;
            }
        }
    } catch (error) {
        showToast("Erro ao carregar detalhes", "error");
    }
}

// --- MODAIS ---
function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

function copiarCodigo() {
    const code = document.getElementById('detail-code').innerText;
    navigator.clipboard.writeText(code);
    showToast("Código copiado!", "success");
}

async function criarSorteio() {
    const titulo = document.getElementById('new-title').value;
    const descricao = document.getElementById('new-desc').value;
    const data_limite = document.getElementById('new-date').value;

    if(!titulo || !data_limite) return showToast("Preencha o título e a data!", "error");

    setLoading('btn-create', true);

    try {
        const res = await fetch(`${API_URL}/sorteios`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ titulo, descricao, data_limite, dono_id: currentUser.id })
        });

        setLoading('btn-create', false);
        if(res.ok) {
            showToast("Sorteio criado com sucesso!");
            closeModal('modal-novo');
            carregarMeusSorteios();
        }
    } catch (error) {
        setLoading('btn-create', false);
    }
}

async function entrarSorteio() {
    const codigo = document.getElementById('invite-code').value.toUpperCase();
    if(!codigo) return showToast("Digite o código!", "error");

    setLoading('btn-join', true);

    try {
        const res = await fetch(`${API_URL}/entrar-sorteio`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ usuario_id: currentUser.id, codigo })
        });

        setLoading('btn-join', false);
        const data = await res.json();

        if(res.ok) {
            showToast("Você entrou no grupo!");
            closeModal('modal-entrar');
            carregarMeusSorteios();
        } else {
            showToast(data.erro, "error");
        }
    } catch (error) {
        setLoading('btn-join', false);
    }
}

async function realizarSorteioNaTela(id) {
    if(!confirm("Tem certeza? Isso fechará o grupo e sorteará os nomes.")) return;
    
    try {
        const res = await fetch(`${API_URL}/realizar-sorteio/${id}`, { method: 'POST' });
        const data = await res.json();
        
        if(res.ok) {
            showToast("Sorteio Realizado! 🎉");
            verDetalhes(id);
        } else {
            showToast(data.erro, "error");
        }
    } catch (error) {
        showToast("Erro ao sortear", "error");
    }
}