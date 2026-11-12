# OrcaCloud hub listing

Status: 0.1.1 was the latest published on the OrcaCloud hub (checked 2026-11-11; 0.2.0 is prepared in this tree and appears after the release is published) (https://cloud.orcaslicer.com/app/plugins/shared-plugins/5f807b01-bfb8-4ad4-a77d-e85e337e4c7f). Not yet run inside OrcaSlicer (see docs/live-run.md).

Screenshots to upload (all in `docs/screenshots/`, sample data in a browser with a mock host, not captured inside OrcaSlicer, so say so in the listing): `calculator.png`, `calculator-expanded.png`, `quotes.png`, `quote-preview.png`, `settings.png`. Add `calculator-pt-BR.png` to the Portuguese listing. Replace them with captures from inside OrcaSlicer after the live run. The `brand/listing-*.png` files are design mockups, not screenshots.

Short descriptions: English 114 characters, Português 113 characters (limit 140).

## English

### Short description

Prices every build plate in OrcaSlicer: Spoolman filament cost, energy, labor, fees and a suggested selling price.

### Long description

Orca Print Calculator adds a tab to OrcaSlicer 2.5 that prices every build plate of the open project.

Slice a plate and it appears with its filament grams and print time. OrcaSlicer's "Slice all" fills the whole project, or you can import a sliced .gcode.3mf. The tab warns when the project may be out of date.

What it calculates:
- Filament cost from your Spoolman spools. Without a match it uses the preset cost and labels it.
- Electricity from a power value suggested for your printer model, marked "Estimated". Many models have no entry and get a generic 120 W. Calibrate it with a smart plug and enter your own value.
- Labor, depreciation, failure rate, extras, shipping and tax.
- A suggested selling price, with a side-by-side comparison of your own sales channels. For each channel you enter a percent fee, a fixed fee, tax and optional price tiers.
- Markup over cost, a minimum order and rounding to Exact, 3 digits, ending in 9 or ending in 0 or 5.
- Batch pricing at each quantity tier, with spare pieces charged to the order.

Saved quotes keep their own inputs and currency. You can print a quote or save it as PDF from the print dialog, and export CSV or HTML to the plugin data folder. The interface is in English and Brazilian Portuguese, works in any currency and follows the Orca dark and light themes.

Permissions: threading, read access to OrcaSlicer's temporary slicing folder, network access only to the Spoolman address you enter, and files only in the plugin's data folder. No telemetry.

Status: in development. Not yet verified inside OrcaSlicer. G-code parsing for Bambu Lab printers rests on synthetic fixtures.

The plugin is not connected to any marketplace. Channel fees are the numbers you enter.

## Português (Brasil)

### Descrição curta

Precifica cada placa no OrcaSlicer: filamento do Spoolman, energia, mão de obra, taxas e preço de venda sugerido.

### Descrição longa

O Orca Print Calculator cria uma aba no OrcaSlicer 2.5 que precifica cada placa do projeto aberto.

Fatie uma placa e ela aparece com os gramas de filamento e o tempo de impressão. O "Fatiar tudo" do OrcaSlicer preenche o projeto inteiro, ou você importa um .gcode.3mf fatiado. A aba avisa quando o projeto pode estar desatualizado.

O que ele calcula:
- Custo do filamento a partir dos seus carretéis no Spoolman. Sem correspondência, usa o custo do preset e avisa.
- Energia a partir de uma potência sugerida para o modelo da sua impressora, com o selo "Estimado". Muitos modelos não têm entrada e recebem 120 W genéricos. Calibre com uma tomada inteligente e digite o seu valor.
- Mão de obra, depreciação, taxa de falha, extras, frete e imposto.
- Preço de venda sugerido, com comparação lado a lado dos seus próprios canais de venda. Em cada canal você informa taxa percentual, taxa fixa, imposto e faixas de preço opcionais.
- Markup sobre o custo, pedido mínimo e arredondamento: Exato, 3 dígitos, termina em 9 ou termina em 0 ou 5.
- Preço por lote em cada faixa de quantidade, com as peças a mais entrando no custo do pedido.

Os orçamentos salvos guardam os próprios dados e a moeda. Você imprime o orçamento ou salva em PDF pela janela de impressão e exporta CSV ou HTML para a pasta de dados do plugin. A interface é em português do Brasil e em inglês, funciona em qualquer moeda e segue os temas escuro e claro do Orca.

Permissões: threading, leitura na pasta temporária de fatiamento do OrcaSlicer, rede só para o endereço do Spoolman que você informar e arquivos só na pasta de dados do plugin. Sem telemetria.

Status: em desenvolvimento. Ainda não verificado dentro do OrcaSlicer. A leitura de G-code de impressoras Bambu Lab se baseia em arquivos sintéticos.

O plugin não se conecta a nenhum marketplace. As taxas dos canais são os números que você informa.
