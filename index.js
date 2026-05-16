require('dotenv').config();
const { fetch } = require('undici');
const { Client, GatewayIntentBits } = require('discord.js');
const { 
    joinVoiceChannel, 
    createAudioPlayer, 
    createAudioResource, 
    AudioPlayerStatus,
    entersState,
    VoiceConnectionStatus,
    StreamType
} = require('@discordjs/voice');
const prism = require('prism-media');
const ffmpeg = require('ffmpeg-static');

/**
 * 🛠️ CONFIGURATION ET PATCHS WINDOWS
 */

// Patch prism-media pour éviter les erreurs de détection FFmpeg
try {
    prism.FFmpeg.getInfo();
} catch (e) {
    prism.FFmpeg.getInfo = () => ({
        command: ffmpeg,
        output: 'Forced via ffmpeg-static',
        version: 'static'
    });
}

// Forcer le mode shell pour la compatibilité Windows (évite EFTYPE)
const origCreate = prism.FFmpeg.create;
prism.FFmpeg.create = function(options) {
    return origCreate.call(this, { ...options, shell: true });
};

/**
 * 🤖 INITIALISATION DU BOT
 */
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Mémoire temporaire (Sera réinitialisée au redémarrage)
const serverSoundChoices = new Map(); // guildId -> soundUrl
const cooldown = new Map();           // userId -> timestamp
const serverSettings = new Map();    // guildId -> { enabled: true, volume: 1.0 }

const COOLDOWN_TIME = 10000; // 10 secondes

client.once('clientReady', (c) => {
    console.log(`✅ Bot prêt ! Connecté en tant que ${c.user.tag}`);
    console.log("🚀 FFmpeg configuré (Shell activé)");
});

/**
 * 💬 GESTION DES COMMANDES TEXTUELLES
 */
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const args = message.content.trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // !help - Liste des commandes
    if (command === '!help') {
        return message.reply(`
🎵 **Aide du Bot Soundboard** :
- \`!help\` : Affiche ce message.
- \`!setsound\` : Liste les sons de la soundboard.
- \`!setsound [n°]\` : Change le son d'accueil du serveur.
- \`!mysound\` : Affiche le son actuel.
- \`!resetsound\` : Revient au son par défaut.
- \`!test\` : Teste le son dans ton salon vocal.
- \`!volume [0-200]\` : (Admin) Règle le volume.
- \`!stats\` : Infos sur le serveur.
- \`!ping\` : Vérifie la latence.
- \`!togglebot\` : (Admin) Active/Désactive l'accueil.
        `);
    }

    // !setsound - Configuration du son
    if (command === '!setsound') {
        try {
            const sounds = await message.guild.soundboardSounds.fetch();
            const soundsArray = Array.from(sounds.values());
            
            if (args.length === 0) {
                const list = soundsArray.map((s, i) => `**${i + 1}**. ${s.name}`).join('\n');
                return message.reply(`🎵 **Sons Soundboard :**\n${list || "Aucun son trouvé."}\n\nUtilise \`!setsound [numéro]\`.`);
            }

            const index = parseInt(args[0]) - 1;
            const selected = soundsArray[index];

            if (!selected) return message.reply("❌ Numéro invalide !");

            serverSoundChoices.set(message.guild.id, selected.url);
            message.reply(`📢 Son d'accueil défini sur : **${selected.name}**`);
        } catch (e) {
            message.reply("❌ Erreur lors de la récupération des sons.");
        }
    }

    // !volume - Réglage du volume (Admin)
    if (command === '!volume') {
        if (!message.member.permissions.has('Administrator')) return message.reply("❌ Admin uniquement.");
        const vol = parseInt(args[0]);
        if (isNaN(vol) || vol < 0 || vol > 200) return message.reply("❌ Volume entre 0 et 200.");
        
        const settings = serverSettings.get(message.guild.id) || { enabled: true };
        settings.volume = vol / 100;
        serverSettings.set(message.guild.id, settings);
        message.reply(`🔊 Volume réglé sur **${vol}%**`);
    }

    // !togglebot - Activer/Désactiver le bot (Admin)
    if (command === '!togglebot') {
        if (!message.member.permissions.has('Administrator')) return message.reply("❌ Admin uniquement.");
        const current = serverSettings.get(message.guild.id)?.enabled ?? true;
        serverSettings.set(message.guild.id, { ...serverSettings.get(message.guild.id), enabled: !current });
        message.reply(`📢 Bot d'accueil : **${!current ? 'ACTIVÉ' : 'DÉSACTIVÉ'}**.`);
    }

    // !test - Tester le son
    if (command === '!test') {
        if (!message.member.voice.channel) return message.reply("❌ Tu dois être en vocal !");
        client.emit('voiceStateUpdate', { channelId: null, guild: message.guild }, message.member.voice);
        message.reply("🔊 Lancement du test...");
    }

    // !ping - Latence
    if (command === '!ping') {
        message.reply(`🏓 Latence : **${client.ws.ping}ms**`);
    }

    // !stats - Infos serveur
    if (command === '!stats') {
        const settings = serverSettings.get(message.guild.id) || { enabled: true, volume: 1.0 };
        message.reply(`📊 **Stats** :\n- **État** : ${settings.enabled !== false ? '✅' : '❌'}\n- **Volume** : ${Math.round((settings.volume || 1) * 100)}%`);
    }

    // !resetsound - Réinitialiser
    if (command === '!resetsound') {
        serverSoundChoices.delete(message.guild.id);
        message.reply("♻️ Son réinitialisé par défaut.");
    }

    // !mysound - Voir le son actuel
    if (command === '!mysound') {
        const url = serverSoundChoices.get(message.guild.id);
        message.reply(url ? "✅ Son personnalisé configuré." : "💡 Son par défaut utilisé.");
    }
});

/**
 * 🎙️ GESTION DES ÉVÉNEMENTS VOCAUX
 */
client.on('voiceStateUpdate', async (oldState, newState) => {
    // Détecter une entrée dans un salon
    if (oldState.channelId !== newState.channelId && newState.channelId !== null) {
        if (newState.id === client.user.id) return; // Ignorer le bot

        const guildId = newState.guild.id;
        const isEnabled = serverSettings.get(guildId)?.enabled ?? true;
        if (!isEnabled) return;

        // Anti-spam
        const userId = newState.id;
        if (cooldown.has(userId) && (Date.now() - cooldown.get(userId) < COOLDOWN_TIME)) return;
        cooldown.set(userId, Date.now());

        try {
            const connection = joinVoiceChannel({
                channelId: newState.channel.id,
                guildId: guildId,
                adapterCreator: newState.guild.voiceAdapterCreator,
            });

            await entersState(connection, VoiceConnectionStatus.Ready, 5000);
            
            const player = createAudioPlayer();
            const sounds = await newState.guild.soundboardSounds.fetch();
            
            // Choix du son (Configuré > Aléatoire de la liste > Null)
            let soundUrl = serverSoundChoices.get(guildId) || (sounds.size > 0 ? sounds.random().url : null);
            if (!soundUrl) return connection.destroy();

            // Téléchargement direct pour bypass FFmpeg
            const response = await fetch(soundUrl);
            const resource = createAudioResource(response.body, { 
                inputType: StreamType.OggOpus, 
                inlineVolume: true 
            });

            // Appliquer le volume
            const vol = serverSettings.get(guildId)?.volume ?? 1.0;
            resource.volume.setVolume(vol);

            connection.subscribe(player);
            player.play(resource);

            // Déconnexion propre
            player.on(AudioPlayerStatus.Idle, () => connection.destroy());
            player.on('error', () => connection.destroy());

        } catch (error) {
            console.error("Erreur vocale :", error);
        }
    }
});

client.login(process.env.TOKEN);
