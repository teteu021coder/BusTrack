/* BusTrack — consulta de horários por linha */
(() => {
  const { api, esc, icone, DIAS, tipoDiaHoje, paraMinutos, agoraEmMinutos } = BusTrack;

  const seletor = document.getElementById("sel-linha");
  const area = document.getElementById("area-horarios");
  let dados = null;        // resposta de /api/linhas/<id>
  let diaAtivo = tipoDiaHoje();

  function atualizarURL(id) {
    history.replaceState(null, "", `?linha=${id}`);
  }

  /**
   * Agrupa ["05:30","05:45","06:00"] em [["05", ["30","45"]], ["06", ["00"]]].
   * Usa Map (e não um objeto comum) para manter a ordem de inserção: chaves
   * numéricas como "10" seriam reordenadas pelo JavaScript e "05" iria para o fim.
   */
  function agruparPorHora(horas) {
    const grupos = new Map();
    horas.forEach((h) => {
      const [hh, mm] = h.split(":");
      if (!grupos.has(hh)) grupos.set(hh, []);
      grupos.get(hh).push(mm);
    });
    return grupos;
  }

  function tabelaDeHorarios(horas, ehHoje) {
    if (!horas.length) {
      return `<div class="empty-state">
        ${icone("clock")}<h3>Sem operação</h3>
        <p>Esta linha não tem saídas cadastradas para ${esc(DIAS[diaAtivo].toLowerCase())}.</p></div>`;
    }
    const agora = agoraEmMinutos();
    const proximo = ehHoje ? horas.find((h) => paraMinutos(h) >= agora) : null;
    const grupos = agruparPorHora(horas);

    const linhas = [...grupos].map(([hh, minutos]) => `
      <div class="hour-row">
        <span class="hour-label">${hh}h</span>
        <div class="hour-mins">
          ${minutos.map((mm) => {
            const hora = `${hh}:${mm}`;
            let classe = "";
            if (ehHoje) classe = hora === proximo ? "next" : paraMinutos(hora) < agora ? "past" : "";
            return `<span class="min-chip ${classe}" ${classe === "next" ? 'aria-label="Próxima saída"' : ""}>${hora}</span>`;
          }).join("")}
        </div>
      </div>`).join("");

    let cartaoProximo = "";
    if (ehHoje) {
      if (proximo) {
        const falta = paraMinutos(proximo) - agora;
        const texto = falta <= 0 ? "saindo agora" : falta < 60 ? `em ${falta} min` : `em ${Math.floor(falta / 60)} h ${falta % 60} min`;
        cartaoProximo = `<div class="next-card">${icone("clock")}
          <div><strong>${proximo}</strong><span>Próxima saída da origem — ${texto}</span></div></div>`;
      } else {
        cartaoProximo = `<div class="next-card">${icone("clock")}
          <div><strong>Encerrado</strong><span>Não há mais saídas previstas para hoje.</span></div></div>`;
      }
    }
    return `${cartaoProximo}<div class="hour-table">${linhas}</div>`;
  }

  function renderizar() {
    const { linha, paradas, horarios, tipo_dia_atual: hoje } = dados;
    const ehHoje = diaAtivo === hoje;

    const abas = Object.keys(DIAS).map((chave) => `
      <button class="tab ${chave === diaAtivo ? "is-active" : ""}" role="tab" aria-selected="${chave === diaAtivo}" data-dia="${chave}">
        ${DIAS[chave]}${chave === hoje ? '<span class="today-dot" title="Hoje"></span>' : ""}
      </button>`).join("");

    const origem = paradas[0];
    area.innerHTML = `
      <div class="hor-head">
        <div class="hor-title" style="--line-color:${esc(linha.cor)}">
          <span class="line-badge">${esc(linha.numero)}</span>
          <div>
            <h2>${esc(linha.nome)}</h2>
            <div class="line-route"><span>${esc(linha.origem)}</span>${icone("arrow")}<span>${esc(linha.destino)}</span></div>
          </div>
        </div>
        <a class="btn btn-primary" href="/mapa?linha=${linha.id}">${icone("map")}Ver no mapa</a>
      </div>

      <div class="hor-layout">
        <div>
          <div class="tabs" role="tablist" aria-label="Tipo de dia">${abas}</div>
          ${tabelaDeHorarios(horarios[diaAtivo], ehHoje)}
        </div>

        <aside class="aside-card" style="--c:${esc(linha.cor)}">
          <h3>Informações da linha</h3>
          <p class="info-line">
            Horários de <strong>saída de ${esc(origem ? origem.nome : linha.origem)}</strong>.
            Duração estimada: <strong>~${linha.duracao_min} min</strong>.
            ${linha.frequencia_min ? `Frequência: <strong>a cada ${linha.frequencia_min} min</strong> (dias úteis).` : ""}
          </p>
          ${linha.observacao ? `<p class="info-line">${esc(linha.observacao)}</p>` : ""}
          <h3>Paradas</h3>
          <ol class="stop-list">
            ${paradas.map((p, i) => `
              <li><div class="stop-btn" style="cursor:default">
                <span class="stop-num">${p.ordem}</span>
                <span class="stop-name">${esc(p.nome)}</span>
                <span class="stop-time">${i === 0 ? "saída" : "+" + Math.round(p.tempo_min) + " min"}</span>
              </div></li>`).join("")}
          </ol>
        </aside>
      </div>`;
  }

  async function carregarLinha(id) {
    area.innerHTML = '<div class="skeleton-block"></div>';
    try {
      dados = await api(`/api/linhas/${id}`);
    } catch (e) {
      area.innerHTML = `<div class="empty-state">${icone("alert")}<h3>Não foi possível carregar</h3><p>${esc(e.message)}</p></div>`;
      return;
    }
    diaAtivo = tipoDiaHoje();
    renderizar();
    atualizarURL(id);
  }

  area.addEventListener("click", (e) => {
    const aba = e.target.closest(".tab");
    if (aba && dados) { diaAtivo = aba.dataset.dia; renderizar(); }
  });
  seletor.addEventListener("change", () => carregarLinha(seletor.value));

  async function iniciar() {
    let lista;
    try {
      lista = (await api("/api/linhas")).linhas;
    } catch (e) {
      area.innerHTML = `<div class="empty-state">${icone("alert")}<h3>Erro</h3><p>${esc(e.message)}</p></div>`;
      return;
    }
    seletor.innerHTML = lista.map((l) =>
      `<option value="${l.id}">${esc(l.numero)} — ${esc(l.nome)}</option>`).join("");
    const pedido = Number(new URLSearchParams(location.search).get("linha"));
    if (pedido && lista.some((l) => l.id === pedido)) seletor.value = String(pedido);
    if (lista.length) carregarLinha(seletor.value);

    // Atualiza o destaque da "próxima saída" a cada minuto
    setInterval(() => { if (dados) renderizar(); }, 60000);
  }

  iniciar();
})();
