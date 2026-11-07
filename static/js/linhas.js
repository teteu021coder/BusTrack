/* BusTrack — página de consulta de linhas */
(() => {
  const { api, esc, icone, debounce } = BusTrack;

  const lista = document.getElementById("lista-linhas");
  const contagem = document.getElementById("contagem");
  const vazio = document.getElementById("vazio");
  const campoBusca = document.getElementById("filtro-q");
  const chips = document.querySelectorAll(".chip[data-filtro]");

  let todas = [];            // linhas devolvidas pela API para o termo atual
  let filtro = "todas";      // todas | hoje | freq

  function aplicarFiltro(linhas) {
    if (filtro === "hoje") return linhas.filter((l) => l.opera_hoje);
    if (filtro === "freq") return linhas.filter((l) => l.frequencia_min && l.frequencia_min <= 20);
    return linhas;
  }

  function cartao(l) {
    const hoje = l.opera_hoje
      ? `<span class="meta-chip ok">${icone("check")}Hoje: ${esc(l.primeira_hoje)} – ${esc(l.ultima_hoje)}</span>`
      : `<span class="meta-chip off">${icone("x")}Não opera hoje</span>`;
    const freq = l.frequencia_min
      ? `<span class="meta-chip">${icone("clock")}A cada ${l.frequencia_min} min</span>` : "";
    return `
      <article class="line-card" style="--line-color:${esc(l.cor)}">
        <div class="line-top">
          <span class="line-badge">${esc(l.numero)}</span>
          <div>
            <h3>${esc(l.nome)}</h3>
            <div class="line-route"><span>${esc(l.origem)}</span>${icone("arrow")}<span>${esc(l.destino)}</span></div>
          </div>
        </div>
        <div class="line-meta">
          ${hoje}${freq}
          <span class="meta-chip">${icone("pin")}${l.total_paradas} paradas</span>
          <span class="meta-chip">${icone("route")}~${l.duracao_min} min</span>
        </div>
        ${l.observacao ? `<p class="line-note">${icone("info")} ${esc(l.observacao)}</p>` : ""}
        <div class="line-actions">
          <a class="btn btn-ghost" href="/horarios?linha=${l.id}">${icone("clock")}Horários</a>
          <a class="btn btn-primary" href="/mapa?linha=${l.id}">${icone("map")}Ver no mapa</a>
        </div>
      </article>`;
  }

  function renderizar() {
    const linhas = aplicarFiltro(todas);
    lista.innerHTML = linhas.map(cartao).join("");
    vazio.hidden = linhas.length > 0;
    contagem.textContent = linhas.length
      ? `${linhas.length} ${linhas.length === 1 ? "linha encontrada" : "linhas encontradas"}`
      : "";
  }

  async function carregar() {
    const q = campoBusca.value.trim();
    try {
      const d = await api(`/api/linhas?q=${encodeURIComponent(q)}`);
      todas = d.linhas;
      renderizar();
    } catch (e) {
      lista.innerHTML = "";
      vazio.hidden = true;
      contagem.textContent = e.message;
      BusTrack.toast(e.message, "error");
    }
  }

  // Eventos
  campoBusca.addEventListener("input", debounce(() => {
    const q = campoBusca.value.trim();
    history.replaceState(null, "", q ? `?q=${encodeURIComponent(q)}` : location.pathname);
    carregar();
  }, 250));

  chips.forEach((chip) => chip.addEventListener("click", () => {
    chips.forEach((c) => c.classList.toggle("is-active", c === chip));
    filtro = chip.dataset.filtro;
    renderizar();
  }));

  document.getElementById("limpar-filtros").addEventListener("click", () => {
    campoBusca.value = "";
    filtro = "todas";
    chips.forEach((c) => c.classList.toggle("is-active", c.dataset.filtro === "todas"));
    history.replaceState(null, "", location.pathname);
    carregar();
  });

  // Termo vindo da URL (?q=...), por exemplo da busca da página inicial
  campoBusca.value = new URLSearchParams(location.search).get("q") || "";
  carregar();
})();
