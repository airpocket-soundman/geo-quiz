# 🌍 geo-quiz

世界の白地図を使って、国の場所と名前を当てるシンプルなウェブクイズです。
ビルド不要・依存なしの静的サイトで、そのまま GitHub Pages で公開できます。

## モード

- **国名 → 場所**: 表示された国名を地図上でクリック
- **場所 → 国名**: 地図で示された国を 4 択から選ぶ
- **自由探索**: 地図上の国にカーソル/タップで国名を確認

地域フィルタ（全世界 / アジア / ヨーロッパ / アフリカ / 北米 / 南米 / オセアニア）と、
出題数（5 / 10 / 20）が選べます。

## ローカルで動かす

ブラウザで [index.html](index.html) を直接開いても動作します。
（CDN から d3 と地図データを読み込むためインターネット接続が必要です）

ローカルサーバ経由で動かしたい場合:

```bash
npx serve .
# または
python -m http.server
```

## GitHub Pages で公開する

1. このリポジトリを GitHub にプッシュ
2. **Settings → Pages** で
   - **Source**: `Deploy from a branch`
   - **Branch**: `main` / **folder**: `/ (root)`
3. 数十秒で `https://<ユーザ名>.github.io/geo-quiz/` で公開されます

## 技術

- 地図描画: [d3](https://d3js.org/) v7（CDN）
- 地図データ: [world-atlas](https://github.com/topojson/world-atlas) 110m（CDN）
- 投影法: Natural Earth
- 国データ（日本語名・地域）: [countries.js](countries.js)

## 既知の制限

- world-atlas 110m を使用しているため、シンガポール・リヒテンシュタインなど非常に小さい国は地図に表示されないか、クリックが難しい場合があります。
- グリーンランド・香港・プエルトリコなどの一部地域は地図には表示されますが、出題対象からは外しています（領土・特別行政区扱い）。
