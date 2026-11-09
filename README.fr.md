# 🧭 gitpilot

[🇬🇧 English](README.md) | 🇫🇷 Français

🌐 [Voir la page d'accueil](https://claude.ai/artifact/X84wVTqr1GgwitrGVLjxmp)

Utilise Git avec des commandes simples, directement dans ton terminal.

Tu tapes `/commit`, gitpilot écrit le message à ta place, et ton travail part sur GitHub. Tu débutes ? Cette page est faite pour toi. 👋

## 🤔 Les mots à connaître

| Mot | En clair |
| --- | --- |
| **Dépôt** | Le dossier de ton projet, suivi par Git |
| **Commit** | Une sauvegarde de ton travail, avec un petit message |
| **Branche** | Une copie du projet pour travailler sans gêner le reste. La branche principale s'appelle souvent `main` |
| **Push** | Envoyer tes commits sur GitHub |
| **Pull** | Récupérer sur ton ordinateur ce qu'il y a de nouveau sur GitHub |
| **Remote** | La version de ton projet en ligne, sur GitHub |
| **Conflit** | Deux personnes ont changé la même ligne, et Git te demande laquelle garder |

## 📥 Installation

Il te faut [Git](https://git-scm.com/downloads), [Node.js](https://nodejs.org) (version 22.12 ou plus récente) et [Yarn](https://yarnpkg.com/getting-started/install).

**1. Installe gitpilot** (Linux ou macOS) :

```bash
git clone https://github.com/sarobidygmail12/gitkraken-cli.git gitpilot
cd gitpilot
yarn install
yarn build
mkdir -p ~/.local/bin
ln -s "$PWD/bin/gitpilot.js" ~/.local/bin/gitpilot
```

**2. Dis à Git qui tu es.** C'est à faire une seule fois :

```bash
git config --global user.name "Ton Nom"
git config --global user.email "ton@email.com"
```

**3. Connecte-toi à GitHub.** Installe [GitHub CLI](https://cli.github.com), puis lance cette commande une seule fois et choisis HTTPS :

```bash
gh auth login
```

gitpilot ne peut pas te demander de mot de passe, donc cette étape est obligatoire pour envoyer ton travail.

## 🎬 Ton premier projet, pas à pas

**1. Crée un dépôt vide** sur <https://github.com/new>, puis copie son adresse.

**2. Ouvre ton projet** dans le terminal et lance gitpilot :

```bash
cd mon-projet
gitpilot
```

**3. Relie ton dossier à GitHub.** Tape `/init`, appuie sur Entrée pour garder le dossier proposé, puis colle l'adresse copiée.

**4. Sauvegarde et envoie ton travail.** Tape `/commit`. Si gitpilot te dit que `main` est protégée, réponds oui. Il te propose ensuite un message : choisis **Valider**.

C'est tout, ton projet est sur GitHub ! 🎉

> [!IMPORTANT]
> `/commit` prend tous tes fichiers modifiés et les envoie sur GitHub tout de suite.

Pour la suite, c'est toujours la même chose : tu travailles, puis tu tapes `/commit`.

## 🖥️ Comprendre l'écran

```text
gitpilot mon-projet main (+3, -2, +3)
```

Tu vois le nom du projet, ta branche, puis tes fichiers pas encore sauvegardés, mis à jour chaque seconde :

- 🟢 `+3` : 3 fichiers ajoutés
- 🔴 `-2` : 2 fichiers supprimés
- 🟠 `+3` : 3 fichiers modifiés

Le titre de la fenêtre du terminal affiche aussi ta branche, par exemple `🚀 Gitpilot : main`.

Les lignes grises montrent les vraies commandes Git lancées pour toi. Pratique pour apprendre ! 👀

**Au clavier :** tape `/` pour voir les commandes, utilise les flèches pour choisir, Tab pour compléter et Entrée pour valider.

## ⭐ Les commandes essentielles

| Commande | Ce qu'elle fait |
| --- | --- |
| `/status` | Montre où tu en es |
| `/commit` | Sauvegarde ton travail et l'envoie sur GitHub |
| `/pull` | Récupère les nouveautés de GitHub |
| `/push` | Envoie tes commits sur GitHub |
| `/first-push` | Fait ton tout premier envoi quand GitHub contient déjà des fichiers |
| `/pr` | Crée une pull request en demandant son titre et sa description |
| `/branch mon-idee` | Crée une nouvelle branche et va dessus |
| `/switch main` | Va sur une autre branche |
| `/log` | Ouvre l'historique du projet dans ton navigateur |
| `/undo` | Annule ton dernier commit pas encore envoyé, sans perdre ton travail |
| `/help` | Ouvre l'aide |
| `/exit` | Quitte gitpilot |

## 🆘 En cas de problème

**🚫 `rejected` ou `fetch first` à ton premier envoi**

GitHub contient déjà des fichiers, comme un README ou une LICENSE. Tape `/first-push`.

**🚫 `rejected` plus tard**

GitHub a des nouveautés que tu n'as pas. Tape `/pull`, puis `/push`. Si `/pull` refuse, lance `git pull --rebase` dans un terminal normal, puis `/push`.

**🔐 L'envoi échoue à cause d'un mot de passe**

Lance `gh auth login` dans un terminal normal.

**⚔️ Un conflit**

Ouvre le fichier indiqué. Tu y verras ceci :

```text
<<<<<<< 
le texte d'un côté
=======
le texte de l'autre côté
>>>>>>> 
```

Garde le bon texte, supprime les lignes `<<<<<<<`, `=======` et `>>>>>>>`, enregistre, puis choisis **Continuer**. Tu as peur ? Choisis **Annuler tout** et tu reviens au point de départ.

**😬 J'ai fait une erreur dans mon commit**

`/undo` fonctionne seulement si le commit n'est pas encore sur GitHub. Comme `/commit` envoie tout de suite, tu peux désactiver l'envoi automatique pour te laisser le temps de vérifier :

```text
/config set commit.autoPush false
```

Tu enverras alors ton travail toi-même avec `/push`.

**🧭 L'écran affiche `HEAD détaché`**

Tu n'es sur aucune branche. Reviens sur la principale avec `/switch main`.

**🗂️ L'écran affiche `pas un dépôt Git`**

Tu n'es pas dans un projet suivi par Git. Va dans le bon dossier, ou tape `/init`.

**❓ `gitpilot: command not found`**

Lance ces deux commandes, puis ouvre un nouveau terminal :

```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

## 🛟 Pas de panique

- gitpilot te demande confirmation avant de sauvegarder sur `main`.
- Il te prévient avant d'inclure un fichier secret, comme un `.env`.
- Il bloque les commandes Git qui peuvent effacer ton travail.
- Si quelque chose échoue, il s'arrête et affiche l'erreur.

## 🤖 Activer l'IA (optionnel)

Sans IA, gitpilot écrit quand même un message simple à partir de la liste de tes fichiers. Pour de meilleurs messages avec Groq, qui est gratuit :

1. Crée une clé sur <https://console.groq.com/keys>.
2. Ajoute cette ligne à ton `~/.bashrc`, puis ouvre un nouveau terminal :

   ```bash
   export GROQ_API_KEY="ta-clé"
   ```

> [!NOTE]
> Tes modifications sont envoyées à Groq pour écrire le message. Le contenu des fichiers secrets (`.env*`, `*.pem`, `*.key`, `id_rsa*`) n'est jamais envoyé.

---

## 🚀 Pour aller plus loin

Tu n'as pas besoin de cette partie pour commencer. Clique sur un titre pour l'ouvrir.

<details>
<summary>📚 Toutes les commandes</summary>

| Commande | Alias | Rôle |
| --- | --- | --- |
| `/init` | | Initialise un dépôt Git dans le dossier demandé (dossier courant par défaut) et le relie au dépôt distant indiqué |
| `/commit ["message"]` | `/cm` | Indexe, génère le message, committe, pousse |
| `/amend ["message"]` | | Modifie le dernier commit non poussé |
| `/undo` | | Annule le dernier commit non poussé, garde ses modifications |
| `/status` | `/s` | État du dépôt |
| `/diff` | | Résumé des changements |
| `/log` | | Graphe des commits dans le navigateur : auteur et branche de chaque commit, branche courante, détail des fichiers |
| `/switch <branche>` | `/sw` | Change de branche, avec autocomplétion |
| `/branch <nom>` | | Crée une branche et bascule dessus |
| `/hotfix [nom]` | | Committe le travail en cours, crée `hotfix/<nom>` depuis develop |
| `/fix [nom]` | | Committe le travail en cours, crée `fix/<nom>` depuis preprod |
| `/cherry-pick <hash...>` | `/cp` | Applique des commits, avec résolution guidée des conflits |
| `/rebase [develop\|preprod]` | `/rb` | Rebase sur la dernière version distante, avec résolution guidée des conflits |
| `/pull` | | `git pull --ff-only` |
| `/push` | | Pousse, pose l'upstream si besoin, affiche le lien de la pull request ouverte s'il y en a une |
| `/first-push` | `/fp` | Première publication : intègre les commits déjà sur le remote, puis pousse et pose l'upstream. Ne force jamais le push |
| `/pr` | `/pull-request` | Demande le titre et la description, pousse la branche si besoin, puis crée la pull request vers la branche par défaut. Nécessite `gh` connecté |
| `/fetch` | | `git fetch --all` |
| `/stash [pop\|list]` | | Met de côté, récupère ou liste |
| `/config` | | Affiche ou modifie la configuration |
| `/help` | `/h` | Liste les commandes, ouvre l'aide détaillée |
| `/clear` | | Efface l'écran |
| `/exit` | `/quit` | Quitte |

</details>

<details>
<summary>⚙️ Configuration</summary>

Le fichier global `~/.gitpilot/config.json` est créé au premier lancement. Un `.gitpilot.json` à la racine d'un dépôt peut en remplacer une partie.

Pour qu'un dépôt cloné ne puisse pas détourner tes diffs, `apiKeyEnv` et `baseUrl` ne sont acceptés que dans le fichier global.

```text
/config                                 liste les options : Entrée modifie celle sélectionnée
/config show                            affiche la configuration effective en JSON
/config set commit.autoPush false       modifie le fichier global
/config set --repo branches.develop dev modifie .gitpilot.json
/config edit                            ouvre le fichier dans $VISUAL ou $EDITOR
```

L'option `ignore` est la liste des fichiers que Git doit ignorer, avec la syntaxe de `.gitignore`, sans `.gitignore` à écrire : `["dist/","*.log"]`. Modifie-la depuis `/config`. gitpilot l'applique via `.git/info/exclude`. Comme avec `.gitignore`, un fichier déjà suivi par Git n'est pas concerné.

`/fix` part de `branches.preprod` et `/hotfix` de `branches.develop`. Si cette branche n'existe pas localement, gitpilot demande laquelle utiliser et enregistre ta réponse dans `.gitpilot.json`, qui reste hors de Git grâce à `.git/info/exclude`.

La page `/help` documente chaque option.

</details>

<details>
<summary>🤖 Autres services d'IA</summary>

gitpilot essaie `ai.provider`, puis les providers de `ai.fallbackOrder`. Il passe au suivant après 15 secondes, ou si le quota est dépassé ou la clé absente. Le dernier recours, `fallback`, construit un message à partir de la liste des fichiers.

**Gemini (palier gratuit).** Crée une clé sur <https://aistudio.google.com/apikey>, puis ajoute à ton `~/.bashrc` : `export GEMINI_API_KEY="..."`

**Ollama (local).** Lance `ollama pull qwen2.5-coder`. Le serveur doit tourner sur `http://localhost:11434`. Avec Ollama, ton diff ne quitte pas ta machine.

Le provider reçoit la liste des fichiers et le diff indexé, tronqué à 12 000 caractères. Pour les fichiers `.env*`, `*.pem`, `*.key` et `id_rsa*`, seul le nom est envoyé.

`apiKeyEnv` contient le nom d'une variable d'environnement, ce qui garde la clé hors du fichier, ou la clé elle-même. Une clé écrite là reste en clair dans `~/.gitpilot/config.json` et est masquée partout où gitpilot affiche la configuration.

Les modèles par défaut changent vite. Si un provider répond `HTTP 404`, change son modèle : `/config set ai.groq.model <modèle>`.

</details>

<details>
<summary>🛟 Tous les garde-fous</summary>

- Le client Git bloque `push --force`, `reset --hard` et `clean` tant qu'un appel n'a pas explicitement confirmé.
- `main` et `preprod` sont protégées par défaut : gitpilot demande confirmation avant d'y committer.
- `/switch` ne change pas de branche avec des modifications en cours sans proposer de les committer ou de les mettre de côté.
- `/hotfix` et `/fix` vérifient le nom et la base avant de committer quoi que ce soit.
- Si `develop` a divergé de son remote, `/hotfix` sauvegarde les commits locaux dans `backup/<branche>-<hash>`, puis aligne `develop` sur le remote. `/fix` s'arrête dans ce cas.
- Si une étape échoue, le flux s'arrête et affiche l'erreur Git brute et l'état du dépôt.
- Le serveur web n'écoute que sur `127.0.0.1` et refuse les requêtes dont l'en-tête `Host` n'est pas local.

</details>

<details>
<summary>🛠️ Ajouter une commande</summary>

1. Crée `src/commands/maCommande.ts` :

   ```ts
   import type { Command } from "./types.js";

   export const maCommande: Command = {
     name: "ma-commande",
     aliases: ["mc"],
     description: "Une ligne affichée dans l'autocomplétion",
     usage: "/ma-commande <argument>",
     examples: ["/ma-commande valeur"],
     gitSteps: ["git rev-parse HEAD"],
     run: async (ctx, [argument]) => {
       const { stdout } = await ctx.git.run(["rev-parse", "HEAD"]);
       ctx.ui.log(`${argument} : ${stdout}`, "success");
     },
   };
   ```

2. Ajoute-la au tableau de `src/commands/registry.ts`.

L'autocomplétion et la page `/help` se mettent à jour seules. Un `<` dans `usage` marque un argument obligatoire : Entrée complète alors la commande au lieu de l'exécuter.

</details>

<details>
<summary>🧑‍💻 Développement et dépendances</summary>

```bash
yarn build       # compile vers dist/ et copie les pages web
yarn typecheck   # vérifie aussi les tests
yarn test        # lance vitest
```

La stack imposée : `ink`, `ink-text-input`, `execa`, `open`, `zod`, et `vitest` pour les tests. S'y ajoutent :

- `react`, requis par `ink`.
- `vite`, requis par `vitest`, que Yarn n'installe pas automatiquement.
- `typescript`, `@types/node` et `@types/react`, pour la compilation et les types, en développement uniquement.

TypeScript reste en version 6, car Yarn 4.10 lui applique un patch qui échoue sur la version 7.

</details>
