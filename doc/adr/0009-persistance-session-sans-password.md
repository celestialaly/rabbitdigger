# 9. Persistance partielle de session sans mot de passe + expiration par inactivité

- **Date** : 2026-04-25
- **Statut** : Accepté

## Contexte

Jusqu'ici, un rafraîchissement de la page (F5) ramenait l'utilisateur sur l'écran
`/connect` avec un formulaire vide : il fallait ressaisir host, ports, vhost, username
**et** mot de passe, puis re-naviguer vers la vue d'origine. C'est friction inutile
pendant le développement et l'exploration interactive.

Deux objectifs concurrents :

1. **UX** — préserver la continuité d'usage à travers un refresh ou la fermeture/ré-ouverture
   du navigateur (formulaire pré-rempli, retour automatique sur la dernière vue après
   reconnexion).
2. **Sécurité** — RabbitMQ utilise une basic-auth simple (header `Authorization`). Persister
   le mot de passe en clair côté navigateur (localStorage / sessionStorage) l'expose à
   toute attaque XSS, à un voisin de poste qui ouvre les DevTools, et à des extensions
   navigateur abusives. Aucun bénéfice d'un chiffrement côté client : la clé devrait
   elle-même résider en mémoire JS, donc XSS = compromission équivalente.

Par ailleurs, il faut éviter qu'une session ouverte indéfiniment reste authentifiée
sans usage : on veut une **expiration après 5 minutes d'inactivité** qui ramène
proprement l'utilisateur sur l'écran de connexion.

## Décision

### 1. Persistance partielle dans `localStorage`

Persister, sous la clé `rabbitdigger:session`, **tout sauf le mot de passe** :
`host`, `managementPort`, `stompPort`, `username`, `vhost`, `lastActivity` (timestamp ms),
`lastRoute` (chemin complet de la dernière vue visitée). Le mot de passe n'est **jamais**
écrit dans `localStorage`, `sessionStorage`, IndexedDB, ni cookies.

Implémenté dans [src/stores/connection.ts](../../src/stores/connection.ts) via :
- `connect()` → écrit le snapshot (sans password) à la fin.
- `disconnect()` → purge la clé `localStorage` + vide `password` en mémoire.
- `touch()` → met à jour `lastActivity` et persiste si connecté.
- `rememberRoute(fullPath)` → met à jour `lastRoute` et persiste si connecté.
- `hydrateFromStorage()` → restaure les refs ; ne reconnecte **jamais** automatiquement.

### 2. Expiration après 5 minutes d'inactivité

Composable [src/composables/useInactivityTimeout.ts](../../src/composables/useInactivityTimeout.ts) :
écoute `mousedown`, `keydown`, `scroll`, `touchstart`, `mousemove` (dernier throttled à
5 s) sur `window`. À chaque événement : reset du `setTimeout(onExpire, 5*60*1000)` et
appel optionnel d'un callback `onActivity` (utilisé pour `connectionStore.touch()`).
Démarré/arrêté dans `App.vue` selon `connectionStore.status === 'connected'`.

À l'expiration :
1. `connectionStore.disconnect()` (purge storage + vide password).
2. Redirection `router.push({ path: '/connect', query: { expired: '1' } })`.
3. `ConnectView` affiche une alerte « Session expirée — veuillez vous reconnecter ».

### 3. Restauration de la dernière route après reconnexion

`App.vue` mémorise `route.fullPath` à chaque navigation (si connecté).
`ConnectView`, après un `connect()` réussi, redirige vers `connectionStore.lastRoute`
si celui-ci existe **et** que `Date.now() - lastActivity < 5 min` ; sinon repli sur `/`.

Le formulaire `ConnectView` lit `connectionStore.host/ports/username/vhost`, donc
`hydrateFromStorage()` au boot suffit à pré-remplir tous les champs sauf le mot de
passe.

## Alternatives considérées

| Option | Pourquoi rejetée |
|---|---|
| Persister le mot de passe en `localStorage` | XSS persistant → vol des credentials et reconnexion silencieuse depuis un autre poste si exfiltré. Le bénéfice "pas besoin de retaper le password au refresh" ne justifie pas l'élargissement de la surface d'attaque. |
| Persister en `sessionStorage` | Survit au refresh mais pas à la fermeture de l'onglet. Moins risqué que `localStorage` mais reste exposé à XSS pour la durée de vie de l'onglet. Compromis envisageable mais non retenu : on préfère la garantie « le password n'est jamais écrit nulle part » et l'UX dégradée d'une ressaisie manuelle. |
| Chiffrement Web Crypto avec passphrase utilisateur | Théâtre de sécurité côté navigateur : la clé dérivée doit finir en mémoire JS pour usage, donc XSS = compromission. Ajoute de la complexité sans bénéfice mesurable. |
| Token de session côté serveur | Hors scope : RabbitMQ n'expose pas nativement de token court ; nécessiterait un proxy d'authentification devant le broker, en contradiction avec le choix « pas de backend » de ce projet (cf. design decisions). |
| Reconnexion silencieuse au refresh sans persistance | Impossible techniquement : la basic-auth REST + STOMP exige les credentials à chaque ouverture de connexion. |

## Conséquences

### Positives
- Aucun mot de passe n'est jamais écrit côté navigateur — surface d'attaque XSS minimale.
- Refresh = formulaire pré-rempli ; après ressaisie du seul mot de passe, l'utilisateur
  retrouve directement la vue qu'il consultait.
- L'expiration automatique limite la fenêtre pendant laquelle un onglet abandonné reste
  authentifié (utile sur poste partagé).
- Le composable `useInactivityTimeout` est générique et réutilisable pour d'autres
  besoins futurs (ex. fermeture automatique d'un dialog).

### Négatives
- L'utilisateur doit ressaisir le mot de passe à chaque refresh ou expiration.
- L'expiration repose sur des événements DOM côté client uniquement ; un script qui
  simulerait des `keydown` pourrait maintenir la session ouverte. Acceptable pour un
  outil de dev local.
- `localStorage` est partagé entre onglets : la dernière route visitée par un onglet
  écrase celle d'un autre. Compromis acceptable pour cet outil ; pas de synchronisation
  multi-onglets à ce stade.

### Suivi
- Tests unitaires : [src/stores/connection.test.ts](../../src/stores/connection.test.ts)
  vérifie explicitement que `localStorage` ne contient jamais le mot de passe.
- Tests composable : [src/composables/useInactivityTimeout.test.ts](../../src/composables/useInactivityTimeout.test.ts).
- Tests vue : [src/views/ConnectView.test.ts](../../src/views/ConnectView.test.ts) couvre
  l'alerte `?expired=1` et la redirection vers `lastRoute`.
- Sync multi-onglets via l'événement `storage` peut être ajoutée plus tard si nécessaire.
