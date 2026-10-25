# Torrent Search para iPhone

Versão iOS (SwiftUI) do **TorrentSearch 0.5.2** para Android ([prajwalch/TorrentSearch](https://github.com/prajwalch/TorrentSearch), licença MIT).
Interface em português do Brasil, com inglês opcional (Ajustes do iPhone → Torrent Search → Idioma).

## Instalação
1. Baixe o `TorrentSearch.ipa` em **Releases**.
2. No AltStore: **My Apps → "+"** e escolha o arquivo.
3. Para abrir os links magnet, instale um cliente de torrent no iPhone (ex.: iTorrent).

Para gerar uma versão nova: aba **Actions → "App iOS: compila e publica o IPA" → Run workflow**.

## Análise do APK original (REA + JADX)
| Item | Resultado |
|---|---|
| Pacote | `com.prajwalch.torrentsearch` 0.5.2 (19), assinado por Prajwal Chapagain |
| Permissões | INTERNET, ACCESS_NETWORK_STATE |
| SDKs de anúncio/rastreamento | Nenhum encontrado |
| Bibliotecas | Jetpack Compose, Ktor/OkHttp, Jsoup, Room, DataStore, Koin, Coil |
| Envio de dados | Nenhum automático. O relatório de erro só é exportado manualmente pelo usuário |

O código-fonte público (tag v0.5.2) foi usado como referência exata do comportamento.

## O que foi portado
- **46 buscadores embutidos**, com a mesma lógica de parsing (Jsoup → SwiftSoup), categorias, datas, tamanhos e IDs.
- **Torznab** (Jackett/Prowlarr): adicionar, editar, testar conexão e detectar categorias.
- Busca paralela com resultados chegando aos poucos, limite máximo, ordenação, filtros (sem fontes, vistos, buscador, categoria, texto) e lista de erros por buscador.
- Explorar: mais recentes e em alta.
- Favoritos com busca, ordenação e importação/exportação em JSON. Histórico de buscas e buscas recentes.
- Proteção Cloudflare: bloqueio automático, desbloqueio via WebView e verificação ao abrir o app.
- Modo NSFW: oculta a categoria Adulto, os resultados adultos e os buscadores inseguros.
- Ações do torrent: abrir no app de torrent, copiar ou compartilhar o magnet, baixar o .torrent, abrir a página e favoritar.

## Privacidade e segurança (diferenças em relação ao original)
- Nenhum SDK de terceiros além do SwiftSoup, que só faz parsing de HTML. O CI falha se encontrar SDK de rastreamento no binário.
- O app só se conecta aos sites dos buscadores ativados. O itorrents.net só é usado quando o usuário pede o arquivo .torrent e o buscador não o fornece.
- Favoritos, histórico e ajustes ficam no iPhone, gravados com `completeFileProtection`. A chave de API do Torznab fica no Keychain (`WhenUnlockedThisDeviceOnly`).
- ATS ativo (só HTTPS), com exceção apenas para a rede local (servidor Torznab caseiro).
- Páginas externas abrem no `SFSafariViewController`, isolado do app.
- `PrivacyInfo.xcprivacy` declara: sem tracking e sem coleta de dados.
- O app não exporta logs com dados do aparelho (o original exporta `logcat` + modelo do aparelho).
- Botão **Ajustes → Apagar todos os dados do app**.

## Testes (CI)
- `Núcleo (Linux)`: compila os buscadores e faz busca real em cada site. O relatório fica no branch `ci-results`.
- Último resultado: **22 buscadores retornando resultados** a partir do servidor do GitHub, e o magnet buscado com sucesso nos que exigem abrir a página.
- Os demais foram bloqueados pelo Cloudflare/WAF por virem de IP de datacenter (esperado) ou estão fora do ar (Torrentz, LinuxTracker). No iPhone, os protegidos são liberados pelo botão "Desbloquear".
- `App iOS`: compila no Xcode 26.6, audita o binário e publica o IPA.

## Limitações conhecidas
- **Tela de detalhes nativa** (pôster, descrição e capturas por site) não foi portada. A página do torrent abre no navegador do app.
- **DNS sobre HTTPS** por app não existe no iOS. Use um perfil de DNS criptografado do sistema.
- Integração com o menu de compartilhar e com a seleção de texto (Android) não foi portada.
- Os sites mudam de layout com frequência. Quando um buscador quebrar, o erro aparece em "Ver erros" na busca.
