# AimForge 3D

Aim trainer 3D no navegador, inspirado em Aim Lab. Foco em **Flick**, **Microflick** e **Tracking** com sistema de sensibilidade nativo para **Valorant** e **CS2**.

## Como rodar

Por usar ES modules + `importmap`, abrir via `file://` não funciona. Suba um servidor estático no diretório do projeto:

```bash
# Opção A: Python
python -m http.server 5500

# Opção B: Node
npx serve .

# Opção C: VSCode
# Instale a extensão "Live Server" e clique em "Go Live"
```

Acesse `http://localhost:5500` (ou a porta exibida).

> **Dica:** clique em **"Tela cheia"** no menu e desative a aceleração do mouse no SO antes de treinar.

## Estrutura

```
.
├── index.html
├── styles.css
├── js/
│   ├── main.js           # entry point, game loop, screen routing
│   ├── store.js          # estado global + localStorage
│   ├── sensitivity.js    # yaw Valorant/CS2, cm/360, conversão
│   ├── input.js          # Pointer Lock + delta do mouse
│   ├── engine.js         # Three.js (cena, câmera FPS, raycast)
│   ├── ui.js             # menu, HUD, crosshair, gráfico
│   ├── stats.js          # tracker de hits/misses/score/reação
│   └── modes/
│       ├── flick.js
│       ├── microflick.js
│       └── tracking.js
└── README.md
```

## Sensibilidade

A app usa diretamente o **yaw nativo** de cada jogo:

| Jogo     | yaw (graus por count·sens) |
|----------|-----------------------------|
| Valorant | 0.07                        |
| CS2      | 0.022                       |

Conversão entre os dois (derivada da razão dos yaws):

```
CS2 sens     = Valorant sens × 3.18182
Valorant sens = CS2 sens ÷ 3.18182
```

Cálculo de **cm/360**:

```js
cm/360 = 360 / (DPI × sens × yaw) × 2.54
```

Aplicação do delta do mouse à câmera:

```js
yawDeg   = mouseDeltaX * sens * gameYaw
pitchDeg = mouseDeltaY * sens * gameYaw

camera.yaw   -= yawDeg   * DEG2RAD
camera.pitch -= pitchDeg * DEG2RAD
```

> **Observação importante:** o navegador, via Pointer Lock API, já entrega `movementX/Y` em *mouse counts* (a mesma unidade que o jogo lê). Por isso **DPI não entra na fórmula de rotação** — ele só é usado para exibir eDPI e cm/360. Aplicar DPI na rotação faria a sensibilidade ficar diferente da do jogo real.

## Modos

- **Flick** — alvo único em posição aleatória dentro de um cone. Acerto respawna outro. Score = `acertos*100 - erros*25 + bônus_velocidade + bônus_sequência`.
- **Microflick** — alvo pequeno aparece a poucos graus do centro da mira. Treina micro-correções. Score = `acertos*120 - erros*30 + bônus_precisão + bônus_reação`.
- **Tracking** — alvo se move (strafe, circular, misto). Pontua por tempo com a mira no alvo. Score = `tempoNoAlvo*10 + precisão_tracking*1000 - penalidade_perda`.

## Testes manuais

- [ ] Mover o mouse rotaciona a câmera (yaw/pitch) com clamp no pitch.
- [ ] No modo Flick, alvos aparecem em posições variadas.
- [ ] No modo Microflick, alvos aparecem perto do centro da mira atual.
- [ ] No modo Tracking, o "Score" cresce enquanto a mira está sobre o alvo e desacelera fora.
- [ ] Mudar de Valorant ↔ CS2 atualiza `cm/360` e o valor "equivalente" imediatamente.
- [ ] Mesma sensibilidade no jogo e no app produz cm/360 equivalente.

## Atalhos

- `ESC` — libera o mouse (pausa o treino)
- `P` — pausar/retomar
- Clique esquerdo — atira (Flick/Microflick)

## Tecnologia

- Three.js (via `importmap` do unpkg, sem build step)
- Pointer Lock API
- LocalStorage para persistir configurações
- `requestAnimationFrame` para o loop
- Vanilla JS modules (sem React para minimizar overhead e input lag)
