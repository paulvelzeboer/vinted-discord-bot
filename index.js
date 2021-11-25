const config = require('./config.json');

const Database = require('easy-json-database');
const db = new Database('./db.json');
if (!db.has('subscriptions')) db.set('subscriptions', []);

const Discord = require('discord.js');
const client = new Discord.Client({
    intents: [Discord.Intents.FLAGS.GUILDS]
});

const synchronizeSlashCommands = require('discord-sync-commands');
synchronizeSlashCommands(client, [
    {
        name: 'subscribe',
        description: 'Subscribe to a search URL',
        options: [
            {
                name: 'url',
                description: 'L\'vinted search URL',
                type: 3,
                required: true
            },
            {
                name: 'channel',
                description: 'The show in which you want to send notifications',
                type: 7,
                required: true
            }
        ]
    },
    {
        name: 'unsubscribe',
        description: 'Unsubscribe to a search UR',
        options: [
            {
                name: 'id',
                description: 'L\'identifier l\'subscription (/subscriptions)',
                type: 3,
                required: true
            }
        ]
    },
    {
        name: 'subscriptions',
        description: 'Go to the list of all your subscriptions',
        options: []
    }
], {
    debug: false,
    guildId: config.guildID
}).then((stats) => {
    console.log(`🔁 Orders Updates ! ${stats.newCommandCount} Orders created, ${stats.currentCommandCount} Existing controls\n`)
});

const vinted = require('vinted-api');

let lastFetchFinished = true;

const syncSubscription = (sub) => {
    return new Promise((resolve) => {
        vinted.search(sub.url, false, false, {
            per_page: '20'
        }).then((res) => {
            if (!res.items) {
                console.log('Search done bug got wrong response. Promise resolved.', res);
                resolve();
                return;
            }
            const isFirstSync = db.get('is_first_sync');
            const lastItemTimestamp = db.get(`last_item_ts_${sub.id}`);
            const items = res.items
                .sort((a, b) => new Date(b.created_at_ts).getTime() - new Date(a.created_at_ts).getTime())
                .filter((item) => !lastItemTimestamp || new Date(item.created_at_ts) > lastItemTimestamp);

            if (!items.length) return void resolve();

            const newLastItemTimestamp = new Date(items[0].created_at_ts).getTime();
            if (!lastItemTimestamp || newLastItemTimestamp > lastItemTimestamp) {
                db.set(`last_item_ts_${sub.id}`, newLastItemTimestamp);
            }

            const itemsToSend = ((lastItemTimestamp && !isFirstSync) ? items.reverse() : [items[0]]);

            for (let item of itemsToSend) {
                const embed = new Discord.MessageEmbed()
                    .setTitle(item.title)
                    .setURL(`https://www.vinted.nl${item.path}`)
                    .setImage(item.photos[0]?.url)
                    .setColor('#008000')
                    .setTimestamp(new Date(item.created_at_ts))
                    .setFooter(`Article related to research : ${sub.id}`)
                    .addField('size', item.size || 'vide', true)
                    .addField('Price', item.price || 'vide', true)
                    .addField('condition', item.status || 'vide', true);
                client.channels.cache.get(sub.channelID)?.send({ embeds: [embed], components: [
                    new Discord.MessageActionRow()
                        .addComponents([
                            new Discord.MessageButton()
                                .setLabel('Details')
                                .setURL(item.url)
                                .setEmoji('🔎')
                                .setStyle('LINK'),
                            new Discord.MessageButton()
                                .setLabel('To buy')
                                .setURL(`https://www.vinted.nl/transaction/buy/new?source_screen=item&transaction%5Bitem_id%5D=${item.id}`)
                                .setEmoji('💸')
                                .setStyle('LINK')
                        ])
                ] });
            }

            if (itemsToSend.length > 0) {
                console.log(`👕 ${itemsToSend.length} ${itemsToSend.length > 1 ? 'New items found' : 'new article found'} for research ${sub.id} !\n`)
            }

            resolve();
        }).catch((e) => {
            console.error('Search returned an error. Promise resolved.', e);
            resolve();
        });
    });
};

const sync = () => {

    if (!lastFetchFinished) return;
    lastFetchFinished = false;

    setTimeout(() => {
        lastFetchFinished = true;
    }, 20_000);

    console.log(`🤖 Synchronization VINTED ...\n`);

    const subscriptions = db.get('subscriptions');
    const promises = subscriptions.map((sub) => syncSubscription(sub));
    Promise.all(promises).then(() => {
        db.set('is_first_sync', false);
        lastFetchFinished = true;
    });

};

client.on('ready', () => {
    console.log(`🔗 Connected to the account of ${client.user.tag} !\n`);

    const entries = db.all().filter((e) => e.key !== 'subscriptions' && !e.key.startsWith('last_item_ts'));
    entries.forEach((e) => {
        db.delete(e.key);
    });
    db.set('is_first_sync', true);

    const messages = [
        `🕊️ CE Free project and free time request.If you have the means, do not hesitate to support development with a donation !`,
    ];
    let idx = 0;
    const donate = () => console.log(messages[ idx % 2 ]);
    setTimeout(() => {
        donate();
    }, 3000);
    setInterval(() => {
        idx++;
        donate();
    }, 120_000);

    sync();
    setInterval(sync, 10000);

    const { version } = require('./package.json');
    client.user.setActivity(`Vinted BOT | v${version}`);
});

client.on('interactionCreate', (interaction) => {

    if (!interaction.isCommand()) return;
    if (!config.adminIDs.includes(interaction.user.id)) return void interaction.reply(`:x: You do not have rights to perform this action !`);

    switch (interaction.commandName) {
        case 'subscribe': {
            const sub = {
                id: Math.random().toString(36).substring(7),
                url: interaction.options.getString('url'),
                channelID: interaction.options.getChannel('channel').id
            }
            db.push('subscriptions', sub);
            db.set(`last_item_ts_${sub.id}`, null);
            interaction.reply(`:white_check_mark: Your subscription has been successfully created !\n**URL**: <${sub.url}>\n**channel**: <#${sub.channelID}>`);
            break;
        }
        case 'unsubscribe': {
            const subID = interaction.options.getString('id');
            const subscriptions = db.get('subscriptions')
            const subscription = subscriptions.find((sub) => sub.id === subID);
            if (!subscription) {
                return void interaction.reply(':x: No subscription found for your search...');
            }
            const newSubscriptions = subscriptions.filter((sub) => sub.id !== subID);
            db.set('subscriptions', newSubscriptions);
            interaction.reply(`:white_check_mark: Subscription deleted successfully !\n**URL**: <${subscription.url}>\n**channel**: <#${subscription.channelID}>`);
            break;
        }
        case 'subscriptions': {
            const subscriptions = db.get('subscriptions');
            const chunks = [];

            subscriptions.forEach((sub) => {
                const content = `**ID**: ${sub.id}\n**URL**: ${sub.url}\n**channel**: <#${sub.channelID}>\n`;
                const lastChunk = chunks.shift() || [];
                if ((lastChunk.join('\n').length + content.length) > 1024) {
                    if (lastChunk) chunks.push(lastChunk);
                    chunks.push([ content ]);
                } else {
                    lastChunk.push(content);
                    chunks.push(lastChunk);
                }
            });

            interaction.reply(`:white_check_mark: **${subscriptions.length}** subscriptions are active !`);

            chunks.forEach((chunk) => {
                const embed = new Discord.MessageEmbed()
                .setColor('RED')
                .setAuthor(`Use the command /unsubscribe to delete a subscription !`)
                .setDescription(chunk.join('\n'));

                interaction.channel.send({ embeds: [embed] });
            });
        }
    }
});

client.login(config.token);
