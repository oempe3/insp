# FOPE III — GitHub Pages JSON Importer

Projeto revisado para o fluxo:

1. O GPT lê as fotos dos checklists FOPE III e gera um arquivo `.json`.
2. O operador abre este site no GitHub Pages.
3. O operador importa o JSON, confere o resumo, informa o token e envia.
4. O Apps Script processa o payload, gera PDF, registra em Google Sheets/Drive e envia e-mail.

## Arquivos

- `index.html`: site moderno para GitHub Pages.
- `assets/pernambuco-iii-logo.png`: logomarca institucional.
- `appsscript/Code.gs`: Apps Script revisado para aceitar JSON puro e envio por formulário `payload`.
- `examples/exemplo_AAA001.json`: payload de exemplo para teste.
- `.nojekyll`: evita processamento Jekyll no GitHub Pages.

## Como publicar no GitHub Pages

1. Crie um repositório no GitHub.
2. Envie estes arquivos para a raiz do repositório.
3. Vá em `Settings > Pages`.
4. Selecione `Deploy from branch` e escolha a branch principal.
5. Acesse a URL gerada pelo GitHub Pages.

## Ajuste no Apps Script

Substitua seu `Code.gs` pelo arquivo `appsscript/Code.gs`.
Depois faça:

`Implantar > Gerenciar implantações > Editar > Nova versão > Implantar`

## Endpoint configurado no HTML

`https://script.google.com/macros/s/AKfycby9tTHHnxHCUn5vdKq8cVBoPWLweVkGdDjQNGRaPX9_wNjZKKvelAZ4CNsnqpYE5j-Z/exec`

O token não fica gravado no HTML. O operador deve informar no momento do envio.
