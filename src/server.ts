import 'dotenv/config';

import http from 'http';

import { 
  Client,
  Message,
  TextChannel,
  VoiceChannel,
  VoiceConnection,
} from 'discord.js';

import ytdl from 'ytdl-core-discord';

interface Command {
  [key: string]: Function;
}

interface Song {
  title: string;
  url: string;
}

interface Queue {
  connection: VoiceConnection | null;
  songs: Song[];
  volume: number;
  playing: boolean;
  voiceChannel: VoiceChannel;
  textChannel: TextChannel;
}

const PREFIX = '!';
const client = new Client();
const queue = new Map<string, Queue>();

async function execute(message: Message): Promise<Message | undefined> {
  const [, songUrl] = message.content.split(' ');

  const voiceChannel = message.member?.voice.channel;
  const guild = message.guild?.id;

  if(!guild) {
    return message.channel.send('Not found guild.');
  }

  if(!voiceChannel) {
    return message.channel.send('You need to be in a voice channel to play music.');
  }

  const permissions = voiceChannel.permissionsFor(guild);

  if(!permissions?.has('CONNECT') || !permissions?.has('SPEAK')) {
    return message.channel.send('I need permissions to join and speak in our channel');
  }

  const songQueue = queue.get(guild);

  const songData = await ytdl.getInfo(songUrl);
  const song = {
    title: songData.videoDetails.title,
    url: songData.videoDetails.video_url,
  }

  if(songQueue) {
    songQueue.songs.push(song);
    return message.channel.send(`✅ **${song.title}** has been added to the queue!`);
  }

  const songQueueConstruct: Queue = {
    connection: null,
    songs: [] as Song[],
    playing: true,
    volume: 10,
    textChannel: message.channel as TextChannel,
    voiceChannel,
  };

  queue.set(guild, songQueueConstruct);
  songQueueConstruct.songs.push(song);
  
  try {
    const connection = await voiceChannel.join();
    songQueueConstruct.connection = connection;

    await play(guild, songQueueConstruct.songs[0]);
  } catch(err) {
    console.error(err);
    queue.delete(guild);

    voiceChannel.leave();

    return message.channel.send(`[ERROR]: ${err}`);
  }

}

async function play(guild: string, song: Song): Promise<void> {
  const songQueue = queue.get(guild);

  if(!songQueue?.connection) return;

  if(!song) {
    songQueue?.voiceChannel.leave();
    queue.delete(guild);
    return;
  }

  const dispatcher = songQueue.connection.play(await ytdl(song.url), { type: 'opus' })
				.on('finish', async () => {
					songQueue.songs.shift();
					await play(guild, songQueue.songs[0]);
				})
				.on('error', error => console.error(error));
			dispatcher.setVolumeLogarithmic(songQueue.volume / 5);
			songQueue.textChannel.send(`🎶 Start playing: **${song.title}**`);
}

client.on('ready', () => {
  console.log(`Bot is ready!`);
});

client.on('message', async (message: Message) => {
  const commands: Command = {
    play: () => execute(message),
  };

  const messageContent = message.content;

  if(!messageContent.startsWith(PREFIX)) return;

  if(message.author.bot) return;

  const [command] = messageContent.split(' ');
  const commandWithoutPrefix = command.replace(PREFIX, '');

  return commands[commandWithoutPrefix]();
});

http.createServer().listen(3333, 'localhost');

client.login(process.env.TOKEN);