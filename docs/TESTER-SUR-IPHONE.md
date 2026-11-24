# Tester Cabas sur ton iPhone

Trois méthodes, de la plus simple à la plus complète. L'app tourne en **mode démo**
(catalogue embarqué, achats simulés) : aucune clé ni compte n'est nécessaire.

## 0. Préparer le projet sur ton ordinateur (une seule fois)

1. Installe **Node.js 22 LTS** (https://nodejs.org) et **Git** (https://git-scm.com).
2. Dans un terminal :

```bash
git clone https://github.com/niedraa/CABAS.git
```

```bash
cd CABAS
```

```bash
git checkout claude/charming-meitner-tua5ev
```

```bash
npm ci
```

## 1. Méthode rapide : Expo Go (Windows ou Mac)

Le câble n'est pas utilisé : l'iPhone et l'ordinateur doivent être **sur le même Wi-Fi**.

1. Sur l'iPhone, installe **Expo Go** depuis l'App Store.
2. Sur l'ordinateur :

```bash
npm run iphone
```

3. Ouvre l'appareil photo de l'iPhone, vise le **QR code** affiché dans le terminal,
   puis touche la notification « Ouvrir dans Expo Go ».

Réseau d'école ou Wi-Fi différents (le QR code ne charge pas) : utilise le tunnel.

```bash
npm run iphone:tunnel
```

Limites d'Expo Go : notifications et achats intégrés sont simulés (c'est prévu par l'app).
Si Expo Go affiche « SDK non compatible », mets Expo Go à jour depuis l'App Store.

## 2. Par câble : build natif (Mac uniquement)

Apple n'autorise la compilation iOS que sur un Mac avec **Xcode**.

1. Installe **Xcode** (Mac App Store), ouvre-le une fois, accepte la licence.
2. Branche l'iPhone, déverrouille-le, touche « Faire confiance à cet ordinateur ».
3. Sur l'iPhone : Réglages → Confidentialité et sécurité → **Mode développeur** → activer (redémarrage).
4. Dans Xcode → Réglages → Comptes : ajoute ton identifiant Apple (gratuit suffit).
5. Lance :

```bash
npm run iphone:cable
```

   Choisis ton iPhone dans la liste. Au premier lancement, si Xcode demande une
   « équipe de signature », sélectionne ton compte Apple. Sur l'iPhone : Réglages →
   Général → VPN et gestion de l'appareil → faire confiance au développeur.

Le dossier `ios/` est généré automatiquement (ne pas le modifier ni le committer).

## 3. Depuis Windows avec câble : build dans le cloud (EAS)

Windows ne peut pas compiler une app iOS. Expo peut le faire dans le cloud,
mais il faut un **compte Apple Developer payant** (99 $/an) :

```bash
npx eas-cli build --profile preview --platform ios
```

Le lien obtenu installe l'app sur l'iPhone enregistré (pas besoin du câble).
Sinon, utilise la méthode 1 (Expo Go), qui marche très bien depuis Windows.

## En cas de souci

- `npm ci` échoue : vérifie `node -v` (22.x attendu).
- Écran blanc ou erreur rouge : relance `npm run iphone` (l'option `--clear` vide le cache).
- Le QR code ne répond pas : même Wi-Fi des deux côtés, sinon `npm run iphone:tunnel`.
