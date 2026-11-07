/* ==========================================================================
   BusTrack — funções compartilhadas por todas as páginas
   Exposto no objeto global `BusTrack`.
   ========================================================================== */
const BusTrack = (() => {
  const DIAS = { util: "Dias úteis", sabado: "Sábados", domingo: "Domingos" };

  /** Protege contra injeção de HTML: use sempre que inserir texto vindo da API. */
  function esc(valor) {
    return String(valor ?? "").replace(/[&<>"']/g, (c) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
  }

  /** Wrapper do fetch: devolve o JSON ou lança um Error com a mensagem da API. */
  async function api(url, opcoes) {
    let resposta;
    try {
      resposta = await fetch(url, opcoes);
    } catch (e) {
      throw new Error("Não foi possível conectar ao servidor.");
    }
    let dados = null;
    try { dados = await resposta.json(); } catch (_) { /* resposta sem JSON */ }
    if (!resposta.ok) {
      const erro = new Error((dados && dados.erro) || `Erro ${resposta.status}`);
      erro.dados = dados;
      throw erro;
    }
    return dados;
  }

  /** Ícone do sprite definido em base.html. */
  function icone(nome, classe = "") {
    return `<svg class="icon ${classe}" aria-hidden="true"><use href="#i-${nome}"/></svg>`;
  }

  /** Executa `fn` somente depois que o usuário parar de digitar. */
  function debounce(fn, atraso = 250) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), atraso); };
  }

  /** Tipo de dia de HOJE, segundo o relógio do navegador. */
  function tipoDiaHoje() {
    const d = new Date().getDay(); // 0 = domingo
    return d === 0 ? "domingo" : d === 6 ? "sabado" : "util";
  }

  /** Minutos desde 00:00 a partir de "HH:MM". */
  function paraMinutos(hhmm) {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  }

  function agoraEmMinutos() {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  }

  /** Mensagem rápida no canto da tela. */
  function toast(texto, tipo = "") {
    const regiao = document.getElementById("toast-region");
    if (!regiao) return;
    const el = document.createElement("div");
    el.className = `toast ${tipo}`;
    el.textContent = texto;
    regiao.appendChild(el);
    setTimeout(() => el.remove(), 3800);
  }

  /** Menu responsivo (celular). */
  function iniciarMenu() {
    const botao = document.getElementById("nav-toggle");
    const nav = document.getElementById("nav");
    if (!botao || !nav) return;
    const alternar = (abrir) => {
      nav.classList.toggle("is-open", abrir);
      botao.setAttribute("aria-expanded", String(abrir));
      botao.innerHTML = icone(abrir ? "x" : "menu");
    };
    botao.addEventListener("click", () => alternar(!nav.classList.contains("is-open")));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") alternar(false); });
    nav.addEventListener("click", (e) => { if (e.target.closest("a")) alternar(false); });
  }

  document.addEventListener("DOMContentLoaded", iniciarMenu);

  return { DIAS, esc, api, icone, debounce, tipoDiaHoje, paraMinutos, agoraEmMinutos, toast };
})();
