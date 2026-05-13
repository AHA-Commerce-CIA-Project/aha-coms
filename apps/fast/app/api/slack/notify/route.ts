import { NextRequest, NextResponse } from 'next/server';

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

interface SlackNotifyPayload {
    taskId: string;
    title: string;
    requesterName: string;
    requesterDivision: string;
    urgency: string;
    description: string;
}

export async function POST(req: NextRequest) {
    try {
        const body: SlackNotifyPayload = await req.json();

        if (!SLACK_WEBHOOK_URL) {
            console.warn('SLACK_WEBHOOK_URL not set. Skipping Slack notification.');
            return NextResponse.json({ ok: true, skipped: true, reason: 'No Slack webhook configured' });
        }

        const urgencyEmoji: Record<string, string> = {
            'P1': '🔴',
            'P2': '🟠',
            'P3': '🟡',
            'P4': '🟢',
            '5-minute': '⚡',
        };

        const emoji = urgencyEmoji[body.urgency] || '🔵';

        const slackPayload = {
            blocks: [
                {
                    type: 'header',
                    text: {
                        type: 'plain_text',
                        text: `${emoji} New Request: ${body.title}`,
                        emoji: true,
                    },
                },
                {
                    type: 'section',
                    fields: [
                        {
                            type: 'mrkdwn',
                            text: `*From:*\n${body.requesterName}`,
                        },
                        {
                            type: 'mrkdwn',
                            text: `*Division:*\n${body.requesterDivision}`,
                        },
                        {
                            type: 'mrkdwn',
                            text: `*Urgency:*\n${body.urgency}`,
                        },
                        {
                            type: 'mrkdwn',
                            text: `*Task ID:*\n\`${body.taskId}\``,
                        },
                    ],
                },
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `*Description:*\n${body.description?.substring(0, 500) || 'No description provided.'}`,
                    },
                },
                {
                    type: 'actions',
                    elements: [
                        {
                            type: 'button',
                            text: {
                                type: 'plain_text',
                                text: '✅ Mark as Done',
                                emoji: true,
                            },
                            style: 'primary',
                            value: body.taskId,
                            action_id: 'mark_task_done',
                        },
                        {
                            type: 'button',
                            text: {
                                type: 'plain_text',
                                text: '👀 View in Dashboard',
                                emoji: true,
                            },
                            url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/fast/nexus?task=${body.taskId}`,
                            action_id: 'view_task',
                        },
                    ],
                },
            ],
        };

        const slackRes = await fetch(SLACK_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(slackPayload),
        });

        if (!slackRes.ok) {
            const text = await slackRes.text();
            console.error('Slack webhook failed:', text);
            return NextResponse.json({ ok: false, error: 'Slack webhook returned error' }, { status: 500 });
        }

        return NextResponse.json({ ok: true });
    } catch (err: any) {
        console.error('Slack notify error:', err);
        return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
    }
}
