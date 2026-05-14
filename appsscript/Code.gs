/****************************************************
 * FOPE III — CHECKLIST OPERACIONAL
 * AAA001 / AAA002
 * Google Apps Script — Code.gs
 * Versão revisada para GPT Action + ping + dry_run
 ****************************************************/

const CONFIG = {
  pastaDriveId:   "1wzbl1LKj5DTa8YCQiBxdhzh4S7VWLEIi",
  logoDriveId:    "192xFu1XqFpxeFz7brxnnpIut8iZ2EIZw",
  emailPadrao:    "vitor.braga@ht-hidrotermica.com.br",
  planilhaId:     "1gNWA0LhPJSZpzjHVcQZvaTOWM5joAq8YOXN7xpeL_nA",

  // IMPORTANTE:
  // Use o mesmo token no Code.gs e no JSON enviado pela Action do GPT.
  // Como esse token já apareceu na conversa, recomendo trocar por outro depois dos testes.
  tokenApi:       "FOPEIII_2026_AAA001_AAA002_9F7K2M8Q4X"
};


/****************************************************
 * ENDPOINT PRINCIPAL
 ****************************************************/

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const action = params.action || "";

  if (action === "ping") {
    const token = params.token || "";

    if (CONFIG.tokenApi && CONFIG.tokenApi !== "FOPEIII_TOKEN_TROCAR") {
      if (token !== CONFIG.tokenApi) {
        return respostaJson_({
          ok: false,
          erro: "Token inválido ou ausente.",
          metodo: "GET",
          timestamp: agora_()
        });
      }
    }

    return respostaJson_({
      ok: true,
      teste: "ping",
      metodo: "GET",
      mensagem: "Action conectada com sucesso via GET.",
      app: "FOPE III",
      versao: "v5-github-pages-json",
      timestamp: agora_()
    });
  }

  return respostaJson_({
    ok: true,
    app: "FOPE III",
    status: "online",
    versao: "v5-github-pages-json",
    rotas: [
      "GET /exec?action=ping&token=...",
      "POST /exec action=register"
    ],
    timestamp: agora_()
  });
}

function doPost(e) {
  try {
    const payload = extrairPayloadRequisicao_(e);

    // Teste rápido. Não gera PDF, não salva planilha e não envia e-mail.
    if (payload.action === "ping") {
      validarTokenApi_(payload);

      return respostaJson_({
        ok: true,
        teste: "ping",
        mensagem: "Endpoint conectado com sucesso.",
        app: "FOPE III",
        metodo: "POST",
        versao: "v5-github-pages-json",
        timestamp: agora_()
      });
    }

    const resultado = processarRegistroChecklist_(payload);
    return respostaJson_(resultado);

  } catch (err) {
    return respostaJson_({
      ok: false,
      erro: err.message,
      timestamp: agora_()
    });
  }
}

/**
 * Aceita três formatos de entrada:
 * 1) JSON puro no corpo do POST;
 * 2) formulário HTML com campo payload contendo o JSON;
 * 3) form-urlencoded manual, usado por sites estáticos como GitHub Pages.
 */
function extrairPayloadRequisicao_(e) {
  if (!e) {
    throw new Error("Evento ausente. Requisição inválida.");
  }

  if (e.parameter && e.parameter.payload) {
    return JSON.parse(e.parameter.payload);
  }

  if (e.postData && e.postData.contents) {
    const raw = e.postData.contents || "";
    const tipo = e.postData.type || "";

    if (tipo.indexOf("application/x-www-form-urlencoded") >= 0 || raw.indexOf("payload=") === 0 || raw.indexOf("&payload=") >= 0) {
      const params = {};
      raw.split("&").forEach(function(par) {
        const idx = par.indexOf("=");
        if (idx < 0) return;
        const chave = decodeURIComponent(par.slice(0, idx).replace(/\+/g, " "));
        const valor = decodeURIComponent(par.slice(idx + 1).replace(/\+/g, " "));
        params[chave] = valor;
      });

      if (params.payload) {
        return JSON.parse(params.payload);
      }
    }

    return JSON.parse(raw || "{}");
  }

  throw new Error("Requisição vazia. Envie JSON puro ou formulário com campo payload.");
}


function respostaJson_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}


function agora_() {
  return Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    "yyyy-MM-dd HH:mm:ss"
  );
}


/****************************************************
 * PROCESSAMENTO PRINCIPAL
 ****************************************************/

function registrarPayloadViaTela(jsonText) {
  try {
    const payload = typeof jsonText === "string" ? JSON.parse(jsonText) : jsonText;
    return processarRegistroChecklist_(payload);
  } catch (err) {
    return {
      ok: false,
      erro: err.message,
      timestamp: agora_()
    };
  }
}


function processarRegistroChecklist_(payload) {
  validarPayloadChecklist_(payload);

  const protocolo = payload.protocolo || gerarProtocolo(payload.formulario);
  payload.protocolo = protocolo;

  const maList = coletarEquipamentosMA_(payload);
  const anotacoes = coletarAnotacoes_(payload);

  // Modo de teste: valida, interpreta e responde sem executar ações pesadas.
  if (payload.dry_run === true) {
    return {
      ok: true,
      modo: "dry_run",
      mensagem: "Payload validado com sucesso. Nenhum PDF, e-mail ou registro definitivo foi gerado.",
      formulario: payload.formulario,
      protocolo: protocolo,
      total_manutencao: maList.length,
      equipamentos_manutencao: maList,
      anotacoes: anotacoes,
      timestamp: agora_()
    };
  }

  const pdfFile = gerarPdfChecklist(payload);
  registrarNaPlanilha(payload, pdfFile);

  if (payload.email_destino || CONFIG.emailPadrao) {
    enviarEmailChecklist(payload, pdfFile);
  }

  return {
    ok: true,
    modo: "definitivo",
    formulario: payload.formulario,
    protocolo: protocolo,
    total_manutencao: maList.length,
    equipamentos_manutencao: maList,
    pdf_url: pdfFile.getUrl(),
    timestamp: agora_()
  };
}


/****************************************************
 * VALIDAÇÕES
 ****************************************************/

function validarTokenApi_(payload) {
  if (!CONFIG.tokenApi || CONFIG.tokenApi === "FOPEIII_TOKEN_TROCAR") {
    return;
  }

  if (!payload || payload.token !== CONFIG.tokenApi) {
    throw new Error("Token inválido ou ausente.");
  }
}


function validarPayloadChecklist_(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Payload inválido.");
  }

  validarTokenApi_(payload);

  if (payload.action !== "register") {
    throw new Error("Ação inválida. Esperado: register.");
  }

  if (!["AAA001", "AAA002"].includes(payload.formulario)) {
    throw new Error("Formulário inválido. Use AAA001 ou AAA002.");
  }

  if (!payload.operador) {
    throw new Error("Campo obrigatório ausente: operador.");
  }

  if (!payload.data) {
    throw new Error("Campo obrigatório ausente: data.");
  }

  if (!payload.dados || typeof payload.dados !== "object") {
    payload.dados = {};
  }

  if (!Array.isArray(payload.alertas)) {
    payload.alertas = [];
  }
}


/****************************************************
 * GOOGLE SHEETS — REGISTRO
 ****************************************************/

function registrarNaPlanilha(payload, pdfFile) {
  if (!CONFIG.planilhaId || CONFIG.planilhaId === "COLE_AQUI_O_ID_DA_PLANILHA") {
    return;
  }

  const ss = SpreadsheetApp.openById(CONFIG.planilhaId);
  const nomeAba = payload.formulario === "AAA001" ? "AAA001" : "AAA002";

  let sheet = ss.getSheetByName(nomeAba);

  if (!sheet) {
    sheet = ss.insertSheet(nomeAba);
    inserirCabecalhos_(sheet);
  }

  if (sheet.getLastRow() === 0) {
    inserirCabecalhos_(sheet);
  }

  const maList = coletarEquipamentosMA_(payload);
  const anotacoes = coletarAnotacoes_(payload);

  const linha = [
    agora_(),
    payload.protocolo || "",
    payload.formulario || "",
    payload.data || "",
    payload.operador || "",
    payload.turma || "",
    payload.supervisor || "",
    payload.horario_inicial || "",
    payload.horario_final || "",
    payload.turno || "",
    maList.length,
    maList.map(e => `${e.equipamento} - ${e.contexto} - ${e.status}`).join(" | "),
    anotacoes.join(" | "),
    JSON.stringify(payload.dados || {}),
    pdfFile ? pdfFile.getUrl() : ""
  ];

  sheet.getRange(sheet.getLastRow() + 1, 1, 1, linha.length).setValues([linha]);

  registrarManutencoes_(ss, payload, maList, pdfFile);
}


function inserirCabecalhos_(sheet) {
  const cabecalhos = [
    "Data/Hora Registro",
    "Protocolo",
    "Formulário",
    "Data Inspeção",
    "Operador",
    "Turma",
    "Supervisor",
    "Horário Inicial",
    "Horário Final",
    "Turno",
    "Total Manutenção",
    "Equipamentos em Manutenção",
    "Anotações",
    "Dados JSON",
    "URL PDF"
  ];

  sheet.appendRow(cabecalhos);
  sheet.getRange(1, 1, 1, cabecalhos.length)
    .setBackground("#071F3A")
    .setFontColor("#FFFFFF")
    .setFontWeight("bold");

  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 150);
  sheet.setColumnWidth(2, 180);
  sheet.setColumnWidth(12, 420);
  sheet.setColumnWidth(13, 420);
  sheet.setColumnWidth(14, 600);
  sheet.setColumnWidth(15, 300);
}


function registrarManutencoes_(ss, payload, maList, pdfFile) {
  if (!maList || maList.length === 0) {
    return;
  }

  let abaMA = ss.getSheetByName("Manutenções");

  if (!abaMA) {
    abaMA = ss.insertSheet("Manutenções");
    abaMA.appendRow([
      "Data",
      "Formulário",
      "Protocolo",
      "Operador",
      "Turma",
      "Supervisor",
      "Equipamento",
      "Contexto",
      "Status",
      "URL PDF"
    ]);

    abaMA.getRange(1, 1, 1, 10)
      .setBackground("#C62828")
      .setFontColor("#FFFFFF")
      .setFontWeight("bold");

    abaMA.setFrozenRows(1);
  }

  maList.forEach(eq => {
    abaMA.appendRow([
      payload.data || "",
      payload.formulario || "",
      payload.protocolo || "",
      payload.operador || "",
      payload.turma || "",
      payload.supervisor || "",
      eq.equipamento || "",
      eq.contexto || "",
      eq.status || "",
      pdfFile ? pdfFile.getUrl() : ""
    ]);
  });
}


function criarPlanilhaModelo() {
  const ss = SpreadsheetApp.create("FOPE III — Registros Operacionais");

  const abaAAA001 = ss.getActiveSheet();
  abaAAA001.setName("AAA001");
  inserirCabecalhos_(abaAAA001);

  const abaAAA002 = ss.insertSheet("AAA002");
  inserirCabecalhos_(abaAAA002);

  const abaMAN = ss.insertSheet("Manutenções");
  abaMAN.appendRow([
    "Data",
    "Formulário",
    "Protocolo",
    "Operador",
    "Turma",
    "Supervisor",
    "Equipamento",
    "Contexto",
    "Status",
    "URL PDF"
  ]);
  abaMAN.getRange(1, 1, 1, 10)
    .setBackground("#C62828")
    .setFontColor("#FFFFFF")
    .setFontWeight("bold");

  const abaDash = ss.insertSheet("Dashboard");
  abaDash.appendRow(["FOPE III — Dashboard de Inspeções", ""]);
  abaDash.getRange("A1")
    .setFontSize(16)
    .setFontWeight("bold")
    .setFontColor("#071F3A");

  abaDash.appendRow(["Indicador", "Total"]);
  abaDash.getRange(2, 1, 1, 2)
    .setBackground("#0B2D55")
    .setFontColor("#FFFFFF")
    .setFontWeight("bold");

  abaDash.appendRow(["Total AAA001", '=COUNTA(AAA001!A:A)-1']);
  abaDash.appendRow(["Total AAA002", '=COUNTA(AAA002!A:A)-1']);
  abaDash.appendRow(["Total Manutenções", '=COUNTA(Manutenções!A:A)-1']);

  if (CONFIG.pastaDriveId) {
    const file = DriveApp.getFileById(ss.getId());
    const pasta = DriveApp.getFolderById(CONFIG.pastaDriveId);
    pasta.addFile(file);
    DriveApp.getRootFolder().removeFile(file);
  }

  Logger.log("Planilha criada. ID: " + ss.getId());
  Logger.log("Cole este ID em CONFIG.planilhaId: " + ss.getId());
}


/****************************************************
 * PDF
 ****************************************************/

function gerarPdfChecklist(payload) {
  const html = montarHtmlChecklist(payload);

  const pdfBlob = Utilities
    .newBlob(html, "text/html", "checklist.html")
    .getAs("application/pdf")
    .setName(nomeArquivoPdf(payload));

  const pasta = DriveApp.getFolderById(CONFIG.pastaDriveId);
  return pasta.createFile(pdfBlob);
}


function nomeArquivoPdf(payload) {
  const protocolo = payload.protocolo || gerarProtocolo(payload.formulario);
  const data = String(payload.data || "").replace(/\//g, "-");
  return `${protocolo}_${payload.formulario}_${data}_Checklist_Operacional.pdf`;
}


function gerarProtocolo(formulario) {
  const stamp = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    "yyyyMMdd-HHmmss"
  );

  return `${formulario}-${stamp}`;
}


function montarHtmlChecklist(payload) {
  const logoBase64 = getLogoBase64_();
  const tipoLabel = payload.formulario === "AAA001" ? "Check-list Externo" : "Check-list Interno";
  const tipoDesc = payload.formulario === "AAA001" ? "Inspeção Externa" : "Inspeção Interna";
  const d = payload.dados || {};
  const maList = coletarEquipamentosMA_(payload);
  const anotacoes = coletarAnotacoes_(payload);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  @page {
    size: A4 portrait;
    margin: 8mm;
  }

  * {
    box-sizing: border-box;
  }

  body {
    font-family: Arial, Helvetica, sans-serif;
    color: #111827;
    margin: 0;
    padding: 0;
    font-size: 10px;
    line-height: 1.25;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .page {
    width: 100%;
    min-height: 276mm;
    page-break-after: always;
    position: relative;
  }

  .page:last-child {
    page-break-after: auto;
  }

  .header {
    display: grid;
    grid-template-columns: 44mm 1fr 30mm;
    border: 1.5px solid #071F3A;
    border-radius: 10px;
    overflow: hidden;
    margin-bottom: 8px;
  }

  .logo {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 6px;
    border-right: 1px solid #071F3A;
    min-height: 58px;
  }

  .logo img {
    max-width: 38mm;
    max-height: 24mm;
    object-fit: contain;
  }

  .logo-fallback {
    font-weight: 900;
    color: #071F3A;
    font-size: 14px;
    text-align: center;
  }

  .title {
    background: linear-gradient(135deg, #071F3A, #1565C0);
    color: white;
    padding: 10px 14px;
  }

  .title small {
    display: block;
    font-size: 9px;
    letter-spacing: .08em;
    text-transform: uppercase;
    opacity: .85;
    margin-bottom: 4px;
  }

  .title h1 {
    margin: 0;
    font-size: 19px;
    line-height: 1.1;
  }

  .box-form {
    display: grid;
    grid-template-rows: 1fr 1fr 1fr;
    text-align: center;
    font-weight: 900;
  }

  .box-form div {
    display: flex;
    align-items: center;
    justify-content: center;
    border-left: 1px solid #071F3A;
    border-bottom: 1px solid #071F3A;
  }

  .box-form div:last-child {
    border-bottom: 0;
  }

  .box-form .cod {
    background: #1565C0;
    color: white;
    font-size: 15px;
  }

  .box-form .pag {
    background: #00796B;
    color: white;
  }

  .sec {
    background: #071F3A;
    color: white;
    padding: 6px 8px;
    border-radius: 7px 7px 0 0;
    font-weight: 900;
    margin-top: 8px;
    font-size: 11px;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 6px;
  }

  th {
    background: #F3F4F6;
    color: #374151;
    font-weight: 900;
    font-size: 9px;
    text-align: left;
  }

  td, th {
    border: 1px solid #D1D5DB;
    padding: 5px 6px;
    vertical-align: top;
  }

  .kpi {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 8px;
    margin: 8px 0;
  }

  .card {
    border: 1px solid #D1D5DB;
    border-radius: 9px;
    padding: 10px;
    background: #F9FAFB;
  }

  .card span {
    display: block;
    color: #6B7280;
    font-size: 9px;
    font-weight: 800;
    text-transform: uppercase;
  }

  .card strong {
    display: block;
    font-size: 24px;
    margin-top: 4px;
  }

  .red {
    color: #991B1B;
  }

  .green {
    color: #166534;
  }

  .notes {
    min-height: 70px;
    white-space: pre-wrap;
  }

  .json {
    font-family: Consolas, monospace;
    font-size: 8px;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .footer {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    border-top: 1px solid #D1D5DB;
    padding-top: 5px;
    color: #6B7280;
    font-size: 9px;
    display: flex;
    justify-content: space-between;
  }
</style>
</head>
<body>

<div class="page">
  ${cabecalhoPdf_(logoBase64, payload.formulario, "PÁG. 1 / 2", tipoLabel)}

  <div class="sec">Dados da inspeção</div>
  <table>
    <tr>
      <th>Operador</th>
      <th>Data</th>
      <th>Horário inicial</th>
      <th>Horário final</th>
      <th>Turno</th>
    </tr>
    <tr>
      <td>${esc_(payload.operador)}</td>
      <td>${esc_(payload.data)}</td>
      <td>${esc_(payload.horario_inicial)}</td>
      <td>${esc_(payload.horario_final)}</td>
      <td>${esc_(payload.turno)}</td>
    </tr>
    <tr>
      <th>Turma</th>
      <th>Supervisor</th>
      <th>Formulário</th>
      <th colspan="2">Protocolo</th>
    </tr>
    <tr>
      <td>${esc_(payload.turma)}</td>
      <td>${esc_(payload.supervisor)}</td>
      <td>${esc_(payload.formulario)}</td>
      <td colspan="2">${esc_(payload.protocolo)}</td>
    </tr>
  </table>

  <div class="kpi">
    <div class="card">
      <span>Formulário</span>
      <strong>${esc_(payload.formulario)}</strong>
    </div>
    <div class="card">
      <span>Total em manutenção</span>
      <strong class="${maList.length ? "red" : "green"}">${maList.length}</strong>
    </div>
    <div class="card">
      <span>Tipo de inspeção</span>
      <strong style="font-size:14px;">${esc_(tipoDesc)}</strong>
    </div>
  </div>

  <div class="sec">Painel de alerta — Equipamentos em manutenção</div>
  <table>
    <tr>
      <th>Equipamento</th>
      <th>Área / contexto</th>
      <th>Status</th>
    </tr>
    ${linhasManutencaoPdf_(maList)}
  </table>

  <div class="sec">Anotações</div>
  <table>
    <tr>
      <td class="notes">${esc_(anotacoes.join("\\n") || "Sem anotações registradas.")}</td>
    </tr>
  </table>

  <div class="footer">
    <span>FOPE III — ${esc_(tipoLabel)}</span>
    <span>${esc_(payload.formulario)} · Pág. 1/2</span>
  </div>
</div>

<div class="page">
  ${cabecalhoPdf_(logoBase64, payload.formulario, "PÁG. 2 / 2", tipoLabel)}

  <div class="sec">Dados estruturados recebidos</div>
  <table>
    <tr>
      <td class="json">${esc_(JSON.stringify(d, null, 2))}</td>
    </tr>
  </table>

  <div class="sec">Alertas informados</div>
  <table>
    <tr>
      <th>Tipo</th>
      <th>Mensagem</th>
    </tr>
    ${linhasAlertasPdf_(payload.alertas || [])}
  </table>

  <div class="footer">
    <span>FOPE III — ${esc_(tipoLabel)}</span>
    <span>${esc_(payload.formulario)} · Pág. 2/2</span>
  </div>
</div>

</body>
</html>`;
}


function cabecalhoPdf_(logoBase64, formulario, pagina, titulo) {
  const logoHtml = logoBase64
    ? `<img src="${logoBase64}">`
    : `<div class="logo-fallback">FOPE<br>III</div>`;

  return `
  <div class="header">
    <div class="logo">${logoHtml}</div>
    <div class="title">
      <small>UTE Pernambuco III · Operação</small>
      <h1>${esc_(titulo)}</h1>
    </div>
    <div class="box-form">
      <div>FORM</div>
      <div class="cod">${esc_(formulario)}</div>
      <div class="pag">${esc_(pagina)}</div>
    </div>
  </div>`;
}


function linhasManutencaoPdf_(maList) {
  if (!maList || maList.length === 0) {
    return `<tr><td colspan="3" style="text-align:center;color:#166534;font-weight:900;">Nenhum equipamento em manutenção identificado.</td></tr>`;
  }

  return maList.map(eq => `
    <tr>
      <td>${esc_(eq.equipamento)}</td>
      <td>${esc_(eq.contexto)}</td>
      <td style="color:#991B1B;font-weight:900;text-align:center;">${esc_(eq.status || "MA")}</td>
    </tr>
  `).join("");
}


function linhasAlertasPdf_(alertas) {
  if (!alertas || alertas.length === 0) {
    return `<tr><td colspan="2" style="text-align:center;color:#6B7280;">Nenhum alerta informado.</td></tr>`;
  }

  return alertas.map(a => `
    <tr>
      <td>${esc_(a.tipo)}</td>
      <td>${esc_(a.mensagem)}</td>
    </tr>
  `).join("");
}


function getLogoBase64_() {
  if (!CONFIG.logoDriveId || CONFIG.logoDriveId === "COLE_AQUI_ID_DO_ARQUIVO_DA_LOGO") {
    return "";
  }

  const file = DriveApp.getFileById(CONFIG.logoDriveId);
  const blob = file.getBlob();

  let ct = blob.getContentType();
  const nm = file.getName().toLowerCase();

  if (!ct || ct === "application/octet-stream") {
    ct = nm.endsWith(".png") ? "image/png"
      : nm.endsWith(".jpg") || nm.endsWith(".jpeg") ? "image/jpeg"
      : "image/png";
  }

  return `data:${ct};base64,${Utilities.base64Encode(blob.getBytes())}`;
}


/****************************************************
 * E-MAIL
 ****************************************************/

function enviarEmailChecklist(payload, pdfFile) {
  const destinatario = payload.email_destino || CONFIG.emailPadrao;

  const tipoLabel = payload.formulario === "AAA001"
    ? "Check-list Externo"
    : "Check-list Interno";

  const tipoDesc = payload.formulario === "AAA001"
    ? "Inspeção Externa"
    : "Inspeção Interna";

  const assunto = "FOPE III - " + tipoLabel + " " + payload.formulario
    + " - " + (payload.data || "")
    + " - " + (payload.operador || "");

  const maList = coletarEquipamentosMA_(payload);
  const corpoHtml = montarEmailHtml_(payload, tipoLabel, tipoDesc, maList, pdfFile);

  GmailApp.sendEmail(destinatario, assunto, "", {
    htmlBody: corpoHtml,
    attachments: [pdfFile.getBlob()],
    name: "FOPE III"
  });
}


function montarEmailHtml_(payload, tipoLabel, tipoDesc, maList, pdfFile) {
  const anotacoes = coletarAnotacoes_(payload);
  const totalMA = maList.length;
  const pdfUrl = pdfFile ? pdfFile.getUrl() : "#";

  const linhasMA = totalMA
    ? maList.map(eq => {
        return "<tr>"
          + "<td style='padding:8px 10px;border-bottom:1px solid #E5E7EB;font-weight:700;color:#111827;'>" + esc_(eq.equipamento) + "</td>"
          + "<td style='padding:8px 10px;border-bottom:1px solid #E5E7EB;color:#374151;'>" + esc_(eq.contexto) + "</td>"
          + "<td style='padding:8px 10px;border-bottom:1px solid #E5E7EB;font-weight:800;color:#991B1B;text-align:center;'>" + esc_(eq.status || "MA") + "</td>"
          + "</tr>";
      }).join("")
    : "<tr><td colspan='3' style='padding:10px;color:#166534;font-weight:700;text-align:center;border-bottom:1px solid #E5E7EB;'>Nenhum equipamento em manutenção identificado.</td></tr>";

  const blocoAnotacoes = anotacoes.length
    ? anotacoes.map(a => "<div style='padding:8px 10px;border-bottom:1px solid #E5E7EB;color:#111827;line-height:1.4;'>" + esc_(a) + "</div>").join("")
    : "<div style='padding:10px;color:#6B7280;'>Sem anotações registradas.</div>";

  return "<!doctype html><html><body style='margin:0;padding:0;background:#F3F4F6;font-family:Arial,Helvetica,sans-serif;'>"
    + "<table role='presentation' width='100%' cellspacing='0' cellpadding='0' style='background:#F3F4F6;padding:18px 0;'><tr><td align='center'>"
    + "<table role='presentation' width='680' cellspacing='0' cellpadding='0' style='width:680px;max-width:96%;background:#FFFFFF;border:1px solid #D1D5DB;border-radius:12px;overflow:hidden;'>"

    + "<tr><td style='background:#111827;color:#FFFFFF;padding:18px 22px;'>"
    + "<div style='font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#D1D5DB;font-weight:700;'>FOPE III</div>"
    + "<div style='font-size:22px;font-weight:900;line-height:1.25;margin-top:4px;'>" + esc_(tipoLabel) + " " + esc_(payload.formulario) + "</div>"
    + "<div style='font-size:13px;color:#E5E7EB;margin-top:3px;'>" + esc_(tipoDesc) + "</div>"
    + "</td></tr>"

    + "<tr><td style='padding:18px 22px 8px 22px;'>"
    + "<div style='font-size:14px;font-weight:900;color:#111827;margin-bottom:8px;'>Dados da inspeção</div>"
    + "<table role='presentation' width='100%' cellspacing='0' cellpadding='0' style='border-collapse:collapse;border:1px solid #E5E7EB;'>"
    + linhaEmailResumo_("Operador", payload.operador)
    + linhaEmailResumo_("Data", payload.data)
    + linhaEmailResumo_("Horário inicial", payload.horario_inicial)
    + linhaEmailResumo_("Horário final", payload.horario_final)
    + linhaEmailResumo_("Turno", payload.turno)
    + "</table>"
    + "</td></tr>"

    + "<tr><td style='padding:10px 22px;'>"
    + "<div style='font-size:14px;font-weight:900;color:#111827;margin-bottom:8px;'>Resultado operacional</div>"
    + "<div style='border:1px solid #E5E7EB;border-radius:10px;padding:14px;background:#F9FAFB;'>"
    + "<span style='font-size:12px;color:#6B7280;font-weight:700;text-transform:uppercase;'>Total em manutenção</span>"
    + "<div style='font-size:34px;line-height:1;font-weight:900;color:" + (totalMA ? "#991B1B" : "#166534") + ";margin-top:4px;'>" + totalMA + "</div>"
    + "</div>"
    + "</td></tr>"

    + "<tr><td style='padding:10px 22px;'>"
    + "<div style='font-size:14px;font-weight:900;color:#111827;margin-bottom:8px;'>Painel de alerta</div>"
    + "<div style='border:2px solid " + (totalMA ? "#991B1B" : "#166534") + ";border-radius:10px;overflow:hidden;'>"
    + "<div style='background:" + (totalMA ? "#FEE2E2" : "#DCFCE7") + ";padding:10px 12px;font-weight:900;color:" + (totalMA ? "#991B1B" : "#166534") + ";'>Equipamentos em manutenção</div>"
    + "<table role='presentation' width='100%' cellspacing='0' cellpadding='0' style='border-collapse:collapse;'>"
    + "<tr style='background:#F9FAFB;'>"
    + "<th align='left' style='padding:8px 10px;border-bottom:1px solid #D1D5DB;font-size:12px;color:#374151;'>Equipamento</th>"
    + "<th align='left' style='padding:8px 10px;border-bottom:1px solid #D1D5DB;font-size:12px;color:#374151;'>Área / contexto</th>"
    + "<th align='center' style='padding:8px 10px;border-bottom:1px solid #D1D5DB;font-size:12px;color:#374151;'>Status</th>"
    + "</tr>" + linhasMA + "</table></div>"
    + "</td></tr>"

    + "<tr><td style='padding:10px 22px 18px 22px;'>"
    + "<div style='font-size:14px;font-weight:900;color:#111827;margin-bottom:8px;'>Anotações</div>"
    + "<div style='border:1px solid #E5E7EB;border-radius:10px;overflow:hidden;background:#FFFFFF;'>" + blocoAnotacoes + "</div>"
    + "</td></tr>"

    + "<tr><td style='padding:12px 22px;background:#F9FAFB;border-top:1px solid #E5E7EB;text-align:center;'>"
    + "<a href='" + esc_(pdfUrl) + "' style='display:inline-block;background:#111827;color:#FFFFFF;text-decoration:none;font-size:13px;font-weight:800;padding:10px 16px;border-radius:8px;'>Abrir PDF no Drive</a>"
    + "<div style='font-size:11px;color:#6B7280;margin-top:8px;'>E-mail automático - UTE Pernambuco III - FOPE III</div>"
    + "</td></tr>"

    + "</table></td></tr></table></body></html>";
}


function linhaEmailResumo_(label, valor) {
  return "<tr>"
    + "<td style='width:38%;padding:8px 10px;border-bottom:1px solid #E5E7EB;background:#F9FAFB;color:#374151;font-weight:800;font-size:12px;text-transform:uppercase;'>" + esc_(label) + "</td>"
    + "<td style='padding:8px 10px;border-bottom:1px solid #E5E7EB;color:#111827;font-weight:700;'>" + esc_(valor || "-") + "</td>"
    + "</tr>";
}


/****************************************************
 * COLETA DE EQUIPAMENTOS EM MANUTENÇÃO
 ****************************************************/

function coletarEquipamentosMA_(payload) {
  const d = payload.dados || {};
  const lista = [];
  const vistos = {};

  function add(equipamento, contexto, valorStatus) {
    if (!isStatusManutencao_(valorStatus)) {
      return;
    }

    const status = extrairStatusDetectado_(valorStatus) || normalizarStatus_(valorStatus) || "MA";
    const chave = equipamento + "|" + contexto + "|" + status;

    if (vistos[chave]) {
      return;
    }

    vistos[chave] = true;

    lista.push({
      equipamento: equipamento,
      contexto: contexto,
      status: status
    });
  }

  function walk(obj, path) {
    if (!obj || typeof obj !== "object") {
      return;
    }

    Object.keys(obj).forEach(function(k) {
      const v = obj[k];
      const p = path ? path + "." + k : k;

      if (k.toLowerCase().includes("status") && isStatusManutencao_(v)) {
        add(nomeEquipamentoPorCaminho_(p), p, v);
      }

      if (isStatusManutencao_(v)) {
        add(nomeEquipamentoPorCaminho_(p), p, v);
      }

      if (v && typeof v === "object") {
        if (v.status !== undefined && isStatusManutencao_(v.status)) {
          add(nomeEquipamentoPorCaminho_(p), p, v.status);
        }

        walk(v, p);
      }
    });
  }

  walk(d, "dados");

  return lista;
}


function nomeEquipamentoPorCaminho_(path) {
  if (!path) {
    return "Equipamento não identificado";
  }

  const partes = String(path).split(".");
  let ultimo = partes[partes.length - 1] || "";

  if (ultimo.toLowerCase() === "status" && partes.length >= 2) {
    ultimo = partes[partes.length - 2];
  }

  return String(ultimo)
    .replace(/_/g, "-")
    .replace(/\b\w/g, c => c.toUpperCase());
}


function normalizarStatus_(valor) {
  if (valor === null || valor === undefined) {
    return "";
  }

  if (typeof valor === "string") {
    return valor
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .trim()
      .replace(/\./g, "")
      .replace(/\s+/g, "_");
  }

  if (typeof valor === "object") {
    const candidatos = [
      "MA",
      "MAN",
      "MNT",
      "MANUT",
      "MANUTENCAO",
      "MANUTENÇÃO",
      "EM_MANUTENCAO",
      "EM_MANUTENÇÃO",
      "OP",
      "SB",
      "DES",
      "AUTO",
      "OPC",
      "MN",
      "MX",
      "FALHA",
      "CRIT"
    ];

    for (let i = 0; i < candidatos.length; i++) {
      const k = candidatos[i];
      if (valor[k] === true) {
        return normalizarStatus_(k);
      }
    }

    if (valor.status) {
      return normalizarStatus_(valor.status);
    }

    if (valor.valor) {
      return normalizarStatus_(valor.valor);
    }
  }

  return String(valor).toUpperCase().trim();
}


function isStatusManutencao_(valor) {
  const s = normalizarStatus_(valor);

  return [
    "MA",
    "MAN",
    "MNT",
    "MANUT",
    "MANUTENCAO",
    "MANUTENÇÃO",
    "EM_MANUTENCAO",
    "EM_MANUTENÇÃO"
  ].includes(s)
    || s.indexOf("MANUT") >= 0;
}


function extrairStatusDetectado_(valor) {
  if (typeof valor === "object" && valor !== null) {
    const keys = Object.keys(valor);

    for (let i = 0; i < keys.length; i++) {
      if (valor[keys[i]] === true && isStatusManutencao_(keys[i])) {
        return keys[i].toUpperCase();
      }
    }

    if (valor.status && isStatusManutencao_(valor.status)) {
      return String(valor.status).toUpperCase();
    }
  }

  if (isStatusManutencao_(valor)) {
    return String(valor).toUpperCase();
  }

  return "";
}


/****************************************************
 * ANOTAÇÕES
 ****************************************************/

function coletarAnotacoes_(payload) {
  const d = payload.dados || {};
  const lista = [];

  function add(v) {
    if (Array.isArray(v)) {
      v.forEach(add);
      return;
    }

    if (v !== null && v !== undefined && String(v).trim()) {
      lista.push(String(v).trim());
    }
  }

  add(d.anotacoes);
  add(d.anotacoes_p1);
  add(d.anotacoes_p2);
  add(d.observacoes);
  add(d.condicoes_gerais_sala_maquinas);

  if (payload.anotacoes) {
    add(payload.anotacoes);
  }

  return lista;
}


/****************************************************
 * UTILITÁRIOS
 ****************************************************/

function esc_(v) {
  return String(v || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function testePingInterno() {
  const eventoSimulado = {
    postData: {
      contents: JSON.stringify({
        action: "ping",
        token: "FOPEIII_2026_AAA001_AAA002_9F7K2M8Q4X"
      })
    }
  };

  const resposta = doPost(eventoSimulado);
  Logger.log(resposta.getContent());
}