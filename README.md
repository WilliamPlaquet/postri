# Postri

Board collaboratif en temps réel : post-its, textes, rectangles, ellipses, losanges, flèches accrochées aux formes et dessin à main levée. Chaque personne connectée voit les curseurs, les sélections et les modifications des autres à l'instant où elles arrivent.

## Lancer le projet

Il faut Node.js 20 ou plus récent.

```bash
npm install
npm run dev
```

- Toi : http://localhost:5173
- Les autres PC du même réseau : `http://<ton-IP>:5173` (le bouton « Partager » d'un board donne directement le bon lien)

`npm run dev` lance deux choses en même temps : le serveur collaboratif (port 3000) et Vite (port 5173) qui relaie l'API et le WebSocket vers ce serveur.

### Version finale (sans Vite)

```bash
npm run build
npm start
```

Tout est alors servi sur un seul port : http://localhost:3000 (et `http://<ton-IP>:3000` pour les autres). Le port se change avec la variable `PORT`.

### Windows : pare-feu

Au premier lancement, Windows demande si Node.js peut communiquer sur le réseau. Coche **Réseaux privés** et accepte, sinon les autres postes ne pourront pas se connecter.

## Partager sur Internet

Depuis le PC qui héberge, le bouton « Partager » d'un board (ou le cadre « Inviter depuis n'importe où » de l'accueil) propose **Partager sur Internet**. Postri ouvre alors un tunnel Cloudflare gratuit et sans compte, puis affiche :

- un **lien public** en `https://….trycloudflare.com` ;
- un **code d'accès** à 6 caractères, que les invités saisissent une fois.

Le lien change à chaque partage et s'arrête quand Postri est fermé. « Nouveau code » déconnecte les invités, qui doivent saisir le nouveau code. Seul le PC qui héberge peut démarrer ou arrêter le partage. Au premier partage, Postri télécharge `cloudflared` (le programme officiel de Cloudflare) dans son dossier de données.

## Application Windows

```bash
npm run app        # lance Postri dans une fenêtre (Electron), pour tester
npm run dist       # fabrique l'installeur release/Postri-Setup.exe (à lancer sous Windows)
npm run dist:zip   # version portable : release/Postri-1.0.0-win.zip
```

Dans l'application, les boards sont enregistrés dans `%APPDATA%\Postri\data`.

## Landing page et publication sur GitHub

La landing page est dans `site/` : une page statique, sans serveur.

Le dépôt est [PlaquetWilliam/postri](https://github.com/PlaquetWilliam/postri) et la page est publiée sur https://plaquetwilliam.github.io/postri/.

1. Dans le dépôt GitHub : **Settings › Pages › Source : GitHub Actions**. Le workflow `Landing page` publie `site/` à chaque push.
2. Pour publier une version de l'application : `git tag v1.0.0` puis `git push origin v1.0.0`. Le workflow `Release Windows` fabrique `Postri-Setup.exe` sur une machine Windows de GitHub et l'ajoute à la Release. Le bouton « Télécharger » de la landing page pointe toujours vers la dernière version.

## Où sont les données ?

Dans le dossier `data/` à la racine du projet :

- `data/boards.json` : la liste des boards (nom, dates, nombre d'éléments)
- `data/<id>.bin` : le contenu de chaque board (format Yjs)

Les sauvegardes se font automatiquement moins d'une seconde après chaque modification. Pour sauvegarder ailleurs : `POSTRI_DATA=chemin/vers/dossier`. Chaque board peut aussi être exporté et réimporté en JSON (menu « … » en haut à droite).

## Utilisation

| Action | Comment |
| --- | --- |
| Outils | Sélection `V`, Main `H`, Post-it `N`, Texte `T`, Rectangle `R`, Ellipse `O`, Losange `D`, Flèche `A`, Crayon `P` |
| Nouveau post-it | Double-clic sur le fond |
| Écrire dans un élément | Double-clic ou `Entrée` ; `Échap` pour terminer |
| Déplacer la vue | Espace + glisser, molette, clic molette, outil Main |
| Zoomer | Ctrl + molette, pincer sur le pavé tactile, `+` / `-` ; `Maj+1` pour tout afficher |
| Relier deux formes | Outil Flèche, partir d'une forme et relâcher sur une autre (`Alt` pour ne pas accrocher) |
| Sélection multiple | `Maj` + clic, ou glisser sur le fond |
| Dupliquer, copier, coller | `Ctrl+D`, `Ctrl+C`, `Ctrl+V` (coller du texte crée un post-it) |
| Annuler, rétablir | `Ctrl+Z`, `Ctrl+Y` (chacun annule seulement ses propres actions) |
| Ordre | `]` premier plan, `[` arrière-plan |

Cliquer sur l'avatar d'un participant centre la vue sur son curseur.

## Structure

```
server/index.js           serveur HTTP + WebSocket (synchro Yjs, présence, sauvegarde, API des boards)
server/templates.js       contenu de départ des modèles (Speedboat, Kanban, Brainstorm, architecture)
server/share.js           partage sur Internet (tunnel Cloudflare) et code d'accès
electron/main.js          application de bureau : démarre le serveur et ouvre la fenêtre
site/                     landing page (GitHub Pages)
.github/workflows/        publication de la landing page et de l'installeur Windows
src/App.tsx               routes (#/ accueil, #/b/<id> board) et profil
src/components/Home.tsx   liste et création des boards
src/components/Board.tsx  canevas : outils, glisser, redimensionner, clavier, copier-coller
src/components/ElementView.tsx   rendu des éléments
src/components/Overlay.tsx       sélection, poignées, curseurs des autres
src/components/Inspector.tsx     panneau de style
src/components/Chrome.tsx        barre du haut, barre d'outils, zoom, aide
src/components/Share.tsx         partage sur Internet et écran du code d'accès
src/lib/useBoard.ts       connexion Yjs, présence, annuler/rétablir
src/lib/geometry.ts       calculs (flèches accrochées, boîtes, tracés)
```

### API du serveur

- `GET /api/boards` : liste des boards
- `POST /api/boards` `{ "name": "...", "template": "blank" | "speedboat" | "kanban" | "brainstorm" | "architecture" }` : crée un board, vide ou à partir d'un modèle
- `GET /api/boards/:id` : infos d'un board
- `DELETE /api/boards/:id` : supprime un board
- `GET /api/info` : adresses IP du serveur sur le réseau
- `WS /ws/:id` : synchronisation temps réel (protocole y-websocket)
- `GET /api/session` : le visiteur vient-il du lien public, a-t-il saisi le code, est-il sur le PC qui héberge
- `POST /api/access` `{ "code": "ABC-123" }` : vérifie le code d'accès d'un invité
- `GET /api/share`, `POST /api/share/start`, `POST /api/share/stop`, `POST /api/share/code` : partage sur Internet (PC qui héberge uniquement)
