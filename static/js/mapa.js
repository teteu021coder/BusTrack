/* BusTrack — mapa interativo (Leaflet + OpenStreetMap) */
(() => {
  const { api, esc, icone, debounce, DIAS } = BusTrack;

  // ----- Mapa base --------------------------------------------------------
  const CENTRO_INICIAL = [-22.858, -47.215];
  const map = L.map("map").setView(CENTRO_INICIAL, 13);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
  }).addTo(map);

  // Camadas (grupos de marcadores que podem ser ligados/desligados)
  const camadaTrajeto = L.layerGroup().addTo(map);   // linha desenhada
  const camadaParadas = L.layerGroup();              // todas as paradas
  const camadaParadasLinha = L.layerGroup();         // paradas numeradas da linha selecionada
  const camadaVeiculos = L.layerGroup().addTo(map);  // ônibus SIMULADOS

  // ----- Elementos da página ---------------------------------------------
  const el = {
    lista: document.getElementById("lista-linhas"),
    filtro: document.getElementById("filtro-linhas"),
    detalhe: document.getElementById("detalhe-linha"),
    tgParadas: document.getElementById("tg-paradas"),
    tgVeiculos: document.getElementById("tg-veiculos"),
    simBox: document.getElementById("sim-box"),
    simHora: document.getElementById("sim-hora"),
    simAgora: document.getElementById("sim-agora"),
    simStatus: document.getElementById("sim-status"),
    badge: document.getElementById("sim-badge"),
  };

  // ----- Estado -----------------------------------------------------------
  let linhas = [];
  let paradas = [];
  let linhaSelecionada = null;
  let pedidoAtual = 0;                       // evita que uma resposta antiga sobrescreva a nova
  const marcadoresParada = new Map();        // id da parada -> marcador
  let marcadoresDaLinha = [];                // marcadores numerados da linha selecionada
  const marcadoresVeiculo = new Map();       // id do veículo simulado -> marcador

  const corDaLinha = (numero) => (linhas.find((l) => l.numero === numero) || {}).cor || "#2563eb";
  const idDaLinha = (numero) => (linhas.find((l) => l.numero === numero) || {}).id;

  // ----- Popups -----------------------------------------------------------
  function popupParada(p) {
    const chips = (p.linhas || []).map((n) =>
      `<a class="pop-line" style="background:${esc(corDaLinha(n))}" href="/horarios?linha=${idDaLinha(n)}">${esc(n)}</a>`
    ).join("");
    return `
      <div class="pop-title">${esc(p.nome)}</div>
      <div class="pop-sub">${esc(p.endereco || "")}</div>
      ${chips ? `<div class="pop-lines">${chips}</div>` : ""}
      <span class="small muted">Clique em uma linha para ver os horários.</span>`;
  }

  function popupVeiculo(v) {
    return `
      <span class="pop-sim">SIMULADO — não é um veículo real</span>
      <div class="pop-title">Linha ${esc(v.numero)} → ${esc(v.destino)}</div>
      <div class="pop-sub">Saída da origem: ${esc(v.saida)}<br>Próxima parada: ${esc(v.proxima_parada)}</div>
      <a class="pop-link" href="/horarios?linha=${v.linha_id}">Ver horários</a>`;
  }

  // ----- Paradas ----------------------------------------------------------
  function criarMarcadoresDeParadas() {
    paradas.forEach((p) => {
      const icon = L.divIcon({
        className: "bt-icon", html: '<div class="stop-marker"></div>',
        iconSize: [14, 14], iconAnchor: [7, 7],
      });
      const m = L.marker([p.lat, p.lng], { icon, title: p.nome, keyboard: true })
        .bindPopup(popupParada(p));
      m.addTo(camadaParadas);
      marcadoresParada.set(p.id, m);
    });
  }

  /** Mostra as paradas conforme o interruptor e conforme haja linha selecionada. */
  function atualizarVisibilidadeParadas() {
    map.removeLayer(camadaParadas);
    map.removeLayer(camadaParadasLinha);
    if (!el.tgParadas.checked) return;
    (linhaSelecionada ? camadaParadasLinha : camadaParadas).addTo(map);
  }

  // ----- Lista de linhas --------------------------------------------------
  function renderizarLista() {
    const termo = el.filtro.value.trim().toLowerCase();
    const visiveis = linhas.filter((l) =>
      !termo || `${l.numero} ${l.nome} ${l.origem} ${l.destino}`.toLowerCase().includes(termo));
    if (!visiveis.length) {
      el.lista.innerHTML = `<p class="small muted">Nenhuma linha encontrada.</p>`;
      return;
    }
    el.lista.innerHTML = visiveis.map((l) => `
      <button class="pick ${l.id === linhaSelecionada ? "is-active" : ""}" style="--c:${esc(l.cor)}"
              data-id="${l.id}" title="${esc(l.nome)}" aria-pressed="${l.id === linhaSelecionada}">
        <span class="dot">${esc(l.numero)}</span>${esc(l.destino)}
      </button>`).join("");
  }

  // ----- Seleção de linha -------------------------------------------------
  function atualizarURL() {
    const params = new URLSearchParams();
    if (linhaSelecionada) params.set("linha", linhaSelecionada);
    history.replaceState(null, "", params.toString() ? `?${params}` : location.pathname);
  }

  function limparSelecao() {
    linhaSelecionada = null;
    camadaTrajeto.clearLayers();
    camadaParadasLinha.clearLayers();
    marcadoresDaLinha = [];
    el.detalhe.innerHTML = "";
    atualizarURL();
    renderizarLista();
    atualizarVisibilidadeParadas();
    atualizarVeiculos();
  }

  async function selecionarLinha(id) {
    if (id === null || id === linhaSelecionada) { limparSelecao(); return; }
    const pedido = ++pedidoAtual;
    let d;
    try {
      d = await api(`/api/linhas/${id}`);
    } catch (e) {
      BusTrack.toast(e.message, "error");
      return;
    }
    if (pedido !== pedidoAtual) return; // chegou uma resposta de um clique mais antigo

    linhaSelecionada = id;
    const cor = d.linha.cor;
    camadaTrajeto.clearLayers();
    camadaParadasLinha.clearLayers();
    marcadoresDaLinha = [];

    // Trajeto: contorno branco + linha colorida por cima
    L.polyline(d.trajeto, { color: "#ffffff", weight: 9, opacity: 0.95, lineJoin: "round" }).addTo(camadaTrajeto);
    L.polyline(d.trajeto, { color: cor, weight: 5, opacity: 1, lineJoin: "round" }).addTo(camadaTrajeto);

    // Paradas numeradas na ordem de passagem
    d.paradas.forEach((p) => {
      const icon = L.divIcon({
        className: "bt-icon",
        html: `<div class="num-marker" style="background:${esc(cor)}">${p.ordem}</div>`,
        iconSize: [28, 28], iconAnchor: [14, 14],
      });
      const m = L.marker([p.lat, p.lng], { icon, title: p.nome })
        .bindPopup(`<div class="pop-title">${p.ordem}. ${esc(p.nome)}</div>
                    <div class="pop-sub">Linha ${esc(d.linha.numero)} · ${Math.round(p.tempo_min)} min após a saída</div>
                    <a class="pop-link" href="/horarios?linha=${id}">Ver horários</a>`);
      m.addTo(camadaParadasLinha);
      marcadoresDaLinha.push(m);
    });

    map.fitBounds(L.latLngBounds(d.trajeto), { padding: [60, 60], maxZoom: 15 });
    renderizarDetalhe(d);
    atualizarURL();
    renderizarLista();
    atualizarVisibilidadeParadas();
    atualizarVeiculos();
  }

  function renderizarDetalhe(d) {
    const l = d.linha;
    el.detalhe.style.setProperty("--c", l.cor);
    el.detalhe.innerHTML = `
      <div class="detail-head">
        <span class="line-badge" style="--line-color:${esc(l.cor)}">${esc(l.numero)}</span>
        <h2>${esc(l.nome)}</h2>
      </div>
      <div class="detail-actions">
        <a class="btn btn-primary btn-small" href="/horarios?linha=${l.id}">${icone("clock")}Horários</a>
        <button class="btn btn-ghost btn-small" id="btn-limpar" type="button">${icone("x")}Limpar seleção</button>
      </div>
      <ol class="stop-list" style="--c:${esc(l.cor)}">
        ${d.paradas.map((p, i) => `
          <li><button class="stop-btn" data-indice="${i}" type="button">
            <span class="stop-num">${p.ordem}</span>
            <span class="stop-name">${esc(p.nome)}</span>
            <span class="stop-time">${i === 0 ? "saída" : "+" + Math.round(p.tempo_min) + " min"}</span>
          </button></li>`).join("")}
      </ol>`;
  }

  // ----- Ônibus SIMULADOS -------------------------------------------------
  function iconeVeiculo(v) {
    return L.divIcon({
      className: "bt-icon",
      html: `<div class="bus-marker"><div class="bus-body" style="background:${esc(v.cor)}">${esc(v.numero)}</div><span class="bus-sim">SIM</span></div>`,
      iconSize: [44, 44], iconAnchor: [22, 22],
    });
  }

  async function atualizarVeiculos() {
    const ligado = el.tgVeiculos.checked;
    el.simBox.hidden = !ligado;
    el.badge.hidden = !ligado;
    if (!ligado) { camadaVeiculos.clearLayers(); marcadoresVeiculo.clear(); return; }

    const params = new URLSearchParams();
    if (linhaSelecionada) params.set("linha", linhaSelecionada);
    if (el.simHora.value) params.set("hora", el.simHora.value);

    let d;
    try {
      d = await api(`/api/veiculos-simulados?${params}`);
    } catch (e) {
      el.simStatus.textContent = e.message;
      return;
    }

    const ativos = new Set();
    d.veiculos.forEach((v) => {
      ativos.add(v.id);
      const existente = marcadoresVeiculo.get(v.id);
      if (existente) {
        existente.setLatLng([v.lat, v.lng]);
        existente.setPopupContent(popupVeiculo(v));
      } else {
        const m = L.marker([v.lat, v.lng], { icon: iconeVeiculo(v), zIndexOffset: 1000, title: `Linha ${v.numero} (simulado)` })
          .bindPopup(popupVeiculo(v));
        m.addTo(camadaVeiculos);
        marcadoresVeiculo.set(v.id, m);
      }
    });
    // remove os que já terminaram a viagem
    [...marcadoresVeiculo.keys()].forEach((id) => {
      if (!ativos.has(id)) { camadaVeiculos.removeLayer(marcadoresVeiculo.get(id)); marcadoresVeiculo.delete(id); }
    });

    const fixo = el.simHora.value ? " · horário fixo" : "";
    el.simStatus.textContent = d.total
      ? `${d.total} ônibus simulado${d.total > 1 ? "s" : ""} · ${d.hora_referencia} (${DIAS[d.tipo_dia]})${fixo}`
      : `Nenhuma viagem simulada às ${d.hora_referencia} (${DIAS[d.tipo_dia]}). Teste outro horário, como 08:00.`;
  }

  // ----- Eventos ----------------------------------------------------------
  el.lista.addEventListener("click", (e) => {
    const botao = e.target.closest(".pick");
    if (botao) selecionarLinha(Number(botao.dataset.id));
  });
  el.filtro.addEventListener("input", debounce(renderizarLista, 150));
  el.tgParadas.addEventListener("change", atualizarVisibilidadeParadas);
  el.tgVeiculos.addEventListener("change", atualizarVeiculos);
  el.simHora.addEventListener("change", atualizarVeiculos);
  el.simAgora.addEventListener("click", () => { el.simHora.value = ""; atualizarVeiculos(); });

  el.detalhe.addEventListener("click", (e) => {
    if (e.target.closest("#btn-limpar")) { limparSelecao(); return; }
    const botao = e.target.closest(".stop-btn");
    if (botao) {
      const m = marcadoresDaLinha[Number(botao.dataset.indice)];
      if (m) { map.setView(m.getLatLng(), Math.max(map.getZoom(), 16)); m.openPopup(); }
    }
  });

  // ----- Inicialização ----------------------------------------------------
  async function iniciar() {
    try {
      const [dl, dp] = await Promise.all([api("/api/linhas"), api("/api/paradas")]);
      linhas = dl.linhas;
      paradas = dp.paradas;
    } catch (e) {
      el.lista.innerHTML = `<p class="small muted">${esc(e.message)}</p>`;
      BusTrack.toast(e.message, "error");
      return;
    }
    criarMarcadoresDeParadas();
    renderizarLista();
    atualizarVisibilidadeParadas();

    const params = new URLSearchParams(location.search);
    const linhaURL = Number(params.get("linha"));
    const paradaURL = Number(params.get("parada"));

    if (linhaURL) await selecionarLinha(linhaURL);
    else await atualizarVeiculos();

    if (paradaURL && marcadoresParada.has(paradaURL)) {
      const m = marcadoresParada.get(paradaURL);
      if (!el.tgParadas.checked || linhaSelecionada) { // garante que a parada esteja visível
        el.tgParadas.checked = true;
        if (linhaSelecionada) limparSelecao();
        atualizarVisibilidadeParadas();
      }
      map.setView(m.getLatLng(), 16);
      m.openPopup();
    }
    setInterval(atualizarVeiculos, 4000);
  }

  setTimeout(() => map.invalidateSize(), 250);
  iniciar();
})();
