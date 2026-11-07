/* BusTrack — formulário de contato com validação (cliente + servidor) */
(() => {
  const { api } = BusTrack;

  const form = document.getElementById("form-contato");
  const status = document.getElementById("form-status");
  const botao = document.getElementById("btn-enviar");
  const contador = document.getElementById("contador");
  const mensagem = document.getElementById("c-mensagem");
  const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

  // Regras de validação (as mesmas existem no servidor, em app.py)
  const regras = {
    nome: (v) => (v.length < 3 ? "Informe seu nome (mínimo de 3 caracteres)." : ""),
    email: (v) => (!EMAIL_RE.test(v) ? "Informe um e-mail válido." : ""),
    assunto: (v) => (!v ? "Selecione um assunto." : ""),
    mensagem: (v) => (v.length < 10 ? "A mensagem deve ter pelo menos 10 caracteres." : ""),
  };

  function mostrarErro(campo, texto) {
    const linha = form.elements[campo].closest(".form-row");
    linha.classList.toggle("has-error", Boolean(texto));
    form.querySelector(`[data-erro="${campo}"]`).textContent = texto;
    form.elements[campo].setAttribute("aria-invalid", texto ? "true" : "false");
  }

  function validarCampo(campo) {
    const texto = regras[campo](form.elements[campo].value.trim());
    mostrarErro(campo, texto);
    return !texto;
  }

  // Validação enquanto o usuário preenche
  Object.keys(regras).forEach((campo) => {
    form.elements[campo].addEventListener("blur", () => validarCampo(campo));
    form.elements[campo].addEventListener("input", () => {
      if (form.elements[campo].closest(".form-row").classList.contains("has-error")) validarCampo(campo);
    });
  });
  mensagem.addEventListener("input", () => { contador.textContent = `${mensagem.value.length}/1000`; });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    status.textContent = "";
    status.className = "form-status";

    const validos = Object.keys(regras).map(validarCampo);
    if (validos.includes(false)) {
      const primeiroInvalido = form.querySelector(".has-error input, .has-error select, .has-error textarea");
      if (primeiroInvalido) primeiroInvalido.focus();
      return;
    }

    botao.disabled = true;
    botao.textContent = "Enviando…";
    try {
      const corpo = {};
      Object.keys(regras).forEach((c) => { corpo[c] = form.elements[c].value.trim(); });
      const r = await api("/api/contato", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      status.textContent = r.mensagem;
      status.classList.add("ok");
      BusTrack.toast("Mensagem enviada!");
      form.reset();
      contador.textContent = "0/1000";
    } catch (erro) {
      // Erros de validação devolvidos pelo servidor
      if (erro.dados && erro.dados.campos) {
        Object.entries(erro.dados.campos).forEach(([campo, texto]) => mostrarErro(campo, texto));
      }
      status.textContent = erro.message;
      status.classList.add("fail");
    } finally {
      botao.disabled = false;
      botao.textContent = "Enviar mensagem";
    }
  });
})();
