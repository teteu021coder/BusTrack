/* BusTrack — página inicial (dashboard + busca rápida) */
(() => {
  const { api, esc, icone, debounce } = BusTrack;

  // ----- Indicadores e listas -------------------------------------------
  function animarNumero(el, destino) {
    const duracao = 700;
    const inicio = performance.now();
    function passo(agora) {
      const t = Math.min((agora - inicio) / duracao, 1);
      el.textContent = Math.round(destino * (1 - Math.pow(1 - t, 3)));
      if (t < 1) requestAnimationFrame(passo);
    }
    requestAnimationFrame(passo);
  }

  function renderSaidas(lista, saidas) {
    if (!saidas.length) {
      lista.innerHTML = `<li class="muted">Não há mais saídas previstas para hoje.</li>`;
      return;
    }
    lista.innerHTML = saidas.map((s) => `
      <li style="--c:${esc(s.cor)}">
        <span class="dep-badge">${esc(s.numero)}</span>
        <div class="dep-info"><strong>${esc(s.nome)}</strong><span>Destino: ${esc(s.destino)}</span></div>
        <span class="dep-time">${esc(s.hora)}</span>
      </li>`).join("");
  }

  function renderAvisos(lista, avisos) {
    lista.innerHTML = avisos.map((a) => `
      <li class="${esc(a.tipo)}">
        ${icone(a.tipo === "alerta" ? "alert" : "info")}
        <div><strong>${esc(a.titulo)}</strong><p>${esc(a.texto)}</p></div>
      </li>`).join("");
  }

  async function carregarResumo() {
    try {
      const d = await api("/api/resumo");
      animarNumero(document.getElementById("st-linhas"), d.totais.linhas);
      animarNumero(document.getElementById("st-paradas"), d.totais.paradas);
      animarNumero(document.getElementById("st-horarios"), d.totais.horarios);
      animarNumero(document.getElementById("st-saidas"), d.totais.saidas_hoje);
      document.getElementById("st-saidas-label").textContent = `Saídas (${d.tipo_dia_nome.toLowerCase()})`;
      document.getElementById("dia-badge").textContent = d.tipo_dia_nome;
      renderSaidas(document.getElementById("lista-saidas"), d.proximas_saidas);
      renderAvisos(document.getElementById("lista-avisos"), d.avisos);
    } catch (e) {
      document.getElementById("lista-saidas").innerHTML = `<li class="muted">${esc(e.message)}</li>`;
      document.getElementById("lista-avisos").innerHTML = "";
      BusTrack.toast(e.message, "error");
    }
  }

  // ----- Busca rápida (linha, destino ou ponto) --------------------------
  const input = document.getElementById("busca-input");
  const caixa = document.getElementById("busca-resultados");

  function fecharResultados() {
    caixa.hidden = true;
    input.setAttribute("aria-expanded", "false");
  }

  function renderResultados(d) {
    let html = "";
    if (d.linhas.length) {
      html += `<div class="sr-group">Linhas</div>` + d.linhas.map((l) => `
        <a class="sr-item" role="option" href="/horarios?linha=${l.id}">
          <span class="dep-badge" style="--c:${esc(l.cor)}">${esc(l.numero)}</span>
          <span><span class="sr-main">${esc(l.nome)}</span><br><span class="sr-sub">${esc(l.origem)} → ${esc(l.destino)}</span></span>
        </a>`).join("");
    }
    if (d.paradas.length) {
      html += `<div class="sr-group">Pontos de ônibus</div>` + d.paradas.map((p) => `
        <a class="sr-item" role="option" href="/mapa?parada=${p.id}">
          <span class="sr-pin">${icone("pin")}</span>
          <span><span class="sr-main">${esc(p.nome)}</span><br><span class="sr-sub">${p.linhas ? "Linhas: " + esc(p.linhas) : "Sem linhas"}</span></span>
        </a>`).join("");
    }
    if (!html) html = `<div class="sr-empty">Nada encontrado para “${esc(d.q)}”.</div>`;
    caixa.innerHTML = html;
    caixa.hidden = false;
    input.setAttribute("aria-expanded", "true");
  }

  const buscar = debounce(async () => {
    const q = input.value.trim();
    if (q.length < 2) { fecharResultados(); return; }
    try {
      renderResultados(await api(`/api/busca?q=${encodeURIComponent(q)}`));
    } catch (e) {
      caixa.innerHTML = `<div class="sr-empty">${esc(e.message)}</div>`;
      caixa.hidden = false;
    }
  }, 250);

  input.addEventListener("input", buscar);
  input.addEventListener("focus", () => { if (input.value.trim().length >= 2) buscar(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") fecharResultados();
    if (e.key === "Enter") {
      // Enter leva para a lista de linhas já filtrada pelo termo digitado
      e.preventDefault();
      const q = input.value.trim();
      window.location.href = q ? `/linhas?q=${encodeURIComponent(q)}` : "/linhas";
    }
    if (e.key === "ArrowDown") {
      const primeiro = caixa.querySelector(".sr-item");
      if (primeiro) { e.preventDefault(); primeiro.focus(); }
    }
  });
  caixa.addEventListener("keydown", (e) => {
    const itens = [...caixa.querySelectorAll(".sr-item")];
    const i = itens.indexOf(document.activeElement);
    if (e.key === "ArrowDown" && i < itens.length - 1) { e.preventDefault(); itens[i + 1].focus(); }
    if (e.key === "ArrowUp") { e.preventDefault(); (i > 0 ? itens[i - 1] : input).focus(); }
    if (e.key === "Escape") { fecharResultados(); input.focus(); }
  });
  document.addEventListener("click", (e) => {
    if (!document.getElementById("busca-home").contains(e.target)) fecharResultados();
  });

  // Atalhos de exemplo
  document.querySelectorAll("[data-busca]").forEach((btn) =>
    btn.addEventListener("click", () => {
      input.value = btn.dataset.busca;
      input.focus();
      buscar();
    }));

  carregarResumo();
})();
