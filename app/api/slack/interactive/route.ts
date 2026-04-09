import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(req: NextRequest) {
    try {
        // Slack sends interactive payloads as application/x-www-form-urlencoded
        const formData = await req.formData();
        const payloadStr = formData.get('payload') as string;

        if (!payloadStr) {
            return NextResponse.json({ error: 'No payload' }, { status: 400 });
        }

        const payload = JSON.parse(payloadStr);
        const action = payload.actions?.[0];

        if (!action) {
            return NextResponse.json({ error: 'No action found' }, { status: 400 });
        }

        if (action.action_id === 'mark_task_done') {
            const taskId = action.value;
            const slackUser = payload.user?.name || payload.user?.username || 'Unknown';

            // Update task status to pending completion details
            try {
                await prisma.task.update({
                    where: { id: taskId },
                    data: { status: 'pending_completion_details' },
                });
            } catch (updateError: any) {
                console.error('Failed to update task:', updateError);
                return NextResponse.json({
                    response_type: 'ephemeral',
                    text: `❌ Failed to update task: ${updateError.message}`,
                });
            }

            // Respond to Slack with an updated message
            return NextResponse.json({
                response_type: 'in_channel',
                replace_original: true,
                text: `✅ Task \`${taskId}\` marked as done by ${slackUser}. Awaiting completion details on the dashboard.`,
            });
        }

        return NextResponse.json({ ok: true });
    } catch (err: any) {
        console.error('Slack interactive handler error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
