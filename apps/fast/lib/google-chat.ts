// Google Chat integration helper library

import { google } from 'googleapis';
import { getCalendarClient } from './google-calendar';
import { getOAuth2Client, getStoredTokens, saveTokens } from './google-calendar';

/**
 * Get an authenticated Google Chat client for a specific user.
 * Reuses the same OAuth tokens as Google Calendar.
 */
export async function getChatClient(userId: string) {
    const tokens = await getStoredTokens(userId);
    if (!tokens) return null;

    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials(tokens);

    // Auto-refresh if expired
    if (tokens.expiry_date && Date.now() > tokens.expiry_date) {
        try {
            const { credentials } = await oauth2Client.refreshAccessToken();
            await saveTokens(userId, {
                access_token: credentials.access_token,
                refresh_token: credentials.refresh_token || tokens.refresh_token,
                expiry_date: credentials.expiry_date,
            });
            oauth2Client.setCredentials(credentials);
        } catch (err: any) {
            console.error('Failed to refresh tokens for Chat:', err.message);
            return null;
        }
    }

    return google.chat({ version: 'v1', auth: oauth2Client });
}

/**
 * List user's Chat spaces (rooms and DMs)
 */
export async function listSpaces(userId: string) {
    const chat = await getChatClient(userId);
    if (!chat) return [];

    try {
        const res = await chat.spaces.list({
            pageSize: 100,
            filter: 'spaceType = "SPACE" OR spaceType = "GROUP_CHAT" OR spaceType = "DIRECT_MESSAGE"',
        });
        console.log('Google Chat spaces response:', JSON.stringify(res.data.spaces?.length ?? 0), 'spaces found');
        return (res.data.spaces || []).map(space => ({
            name: space.name,
            displayName: space.displayName || 'Direct Message',
            type: space.type,
            singleUserBotDm: space.singleUserBotDm,
            spaceType: space.spaceType,
            threaded: space.spaceThreadingState === 'THREADED_MESSAGES',
        }));
    } catch (err: any) {
        console.error('Google Chat listSpaces error:', err.message, err.response?.data || '');
        return [];
    }
}

/**
 * List messages in a space
 */
export async function listMessages(userId: string, spaceName: string, pageSize = 25, pageToken?: string) {
    const chat = await getChatClient(userId);
    if (!chat) return { messages: [], nextPageToken: null };

    try {
        const res = await chat.spaces.messages.list({
            parent: spaceName,
            pageSize,
            ...(pageToken ? { pageToken } : {}),
            orderBy: 'createTime desc',
        });

        const messages = (res.data.messages || []).map(msg => ({
            name: msg.name,
            text: msg.text || '',
            sender: msg.sender?.displayName || 'Unknown',
            senderType: msg.sender?.type,
            createTime: msg.createTime,
            threadName: msg.thread?.name || null,
            threadReply: !!msg.thread?.threadKey,
        }));

        return {
            messages,
            nextPageToken: res.data.nextPageToken || null,
        };
    } catch (err: any) {
        console.error('Google Chat listMessages error:', err.message);
        return { messages: [], nextPageToken: null };
    }
}

/**
 * Send a message in a space
 */
export async function sendMessage(userId: string, spaceName: string, text: string, threadName?: string) {
    const chat = await getChatClient(userId);
    if (!chat) return null;

    try {
        const requestBody: any = { text };
        if (threadName) {
            requestBody.thread = { name: threadName };
        }

        const res = await chat.spaces.messages.create({
            parent: spaceName,
            requestBody,
            ...(threadName ? { messageReplyOption: 'REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD' } : {}),
        });

        return {
            name: res.data.name,
            text: res.data.text,
            sender: res.data.sender?.displayName,
            createTime: res.data.createTime,
        };
    } catch (err: any) {
        console.error('Google Chat sendMessage error:', err.message);
        return null;
    }
}

/**
 * List members of a space
 */
export async function listMembers(userId: string, spaceName: string) {
    const chat = await getChatClient(userId);
    if (!chat) return [];

    try {
        const res = await chat.spaces.members.list({
            parent: spaceName,
            pageSize: 100,
        });

        return (res.data.memberships || []).map(m => ({
            name: m.name,
            memberName: m.member?.name,
            displayName: m.member?.displayName || 'Unknown',
            type: m.member?.type,
        }));
    } catch (err: any) {
        console.error('Google Chat listMembers error:', err.message);
        return [];
    }
}
