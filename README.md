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

## Inviter des personnes sur un board

**L'hôte** est la personne assise devant le PC qui fait tourner Postri (l'application ou `npm start`). Elle seule peut créer, supprimer et partager des boards, et elle n'a jamais de code à saisir.

**Tous les autres sont des invités**, qu'ils viennent du réseau local ou d'Internet :

- chaque board a son propre **code d'accès** à 6 caractères (ex. `CEP-QX7`), visible par l'hôte dans « Partager » ;
- un code n'ouvre **que son board** : l'accueil d'un invité ne montre que les boards dont il a saisi le code ;
- les invités peuvent modifier le contenu du board, mais pas créer ni supprimer de boards ;
- « Nouveau code » déconnecte les invités de ce board, qui doivent saisir le nouveau code ;
- le code est retenu 30 jours dans le navigateur de l'invité.

### Partager sur Internet

Dans « Partager », l'hôte peut cliquer sur **Partager sur Internet**. Postri ouvre un tunnel Cloudflare gratuit et sans compte, et affiche un **lien public** en `https://….trycloudflare.com`. Les invités doivent quand même saisir le code du board.

Le lien change à chaque partage et s'arrête quand Postri est fermé. Au premier partage, Postri télécharge `cloudflared` (le programme officiel de Cloudflare) dans son dossier de données.

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
2. Pour publier une nouvelle version de l'application : change `"version"` dans `package.json` (par exemple `1.0.0` → `1.1.0`) et pousse sur `main`. Le workflow `Release Windows` fabrique `Postri-Setup.exe` sur une machine Windows de GitHub et crée la Release `v1.1.0`. Le bouton « Télécharger » de la landing page pointe toujours vers la dernière version.

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
server/share.js           lien public sur Internet (tunnel Cloudflare)
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
src/components/Share.tsx         invitation (code du board, liens), écran du code d'accès
src/lib/useBoard.ts       connexion Yjs, présence, annuler/rétablir
src/lib/geometry.ts       calculs (flèches accrochées, boîtes, tracés)
```

### API du serveur

- `GET /api/boards` : liste des boards (tous pour l'hôte, ceux déverrouillés pour un invité)
- `POST /api/boards` `{ "name": "...", "template": "blank" | "speedboat" | "kanban" | "brainstorm" | "architecture" }` : crée un board, vide ou à partir d'un modèle
- `GET /api/boards/:id` : infos d'un board
- `DELETE /api/boards/:id` : supprime un board
- `GET /api/info` : adresses IP du serveur sur le réseau
- `WS /ws/:id` : synchronisation temps réel (protocole y-websocket)
- `GET /api/session` : le visiteur est-il l'hôte, vient-il du lien public
- `POST /api/boards/:id/access` `{ "code": "ABC-123" }` : un invité saisit le code d'un board
- `GET /api/boards/:id/invite`, `POST /api/boards/:id/invite` : voir ou changer le code d'un board (hôte)
- `GET /api/share`, `POST /api/share/start`, `POST /api/share/stop` : lien public sur Internet (hôte)

Création et suppression de boards : hôte uniquement. Un invité ne voit que les boards dont il a le code.
