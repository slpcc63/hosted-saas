import 'server-only';
import { db } from '@/lib/db';
import { getSquareConnectionByCustomerId } from '@/lib/square-connections';
import { getSquarePluginInstallationsByCustomerId } from '@/lib/square-plugin-installations';
import { revokeSquareAccessToken } from '@/lib/square';
import { disconnectSquareAuthorization } from '@/lib/square-disconnect';
import { runTimeCardDisconnect } from '@/lib/time-card-disconnect-policy';
import { ensureTimeCardManagerSettingsTable } from '@/lib/square-time-card-manager';
import { ensureTimeCardEmailWorkflowTables } from '@/lib/time-card-email-workflow';

export async function disconnectTimeCardSandbox(customerId: string) {
  if (process.env.VERCEL_ENV !== 'preview' || process.env.SQUARE_ENVIRONMENT !== 'sandbox') {
    throw new Error('Controlled Sandbox disconnect is unavailable here');
  }
  const installations = await getSquarePluginInstallationsByCustomerId(customerId);
  return runTimeCardDisconnect({
    pluginIds: installations.map(x => x.pluginId),
    disconnect: async () => {
      await ensureTimeCardManagerSettingsTable();
      await ensureTimeCardEmailWorkflowTables();
      const snapshot = await db.query('select access_token from square_connections where customer_id=$1', [customerId]);
      return disconnectSquareAuthorization({
        getConnection: () => getSquareConnectionByCustomerId(customerId),
        revokeAccess: revokeSquareAccessToken,
        finalizeLocalDisconnect: async id => {
          const client = await db.connect();
          try {
            await client.query('begin');
            if (id) {
              const deleted = await client.query('delete from square_connections where customer_id=$1 and id=$2 and access_token=$3 returning id', [customerId,id,snapshot.rows[0]?.access_token]);
              if (!deleted.rowCount) throw new Error('Connection changed during disconnect; reconnect and verify access');
            }
            await client.query('update square_time_card_manager_settings set automation_enabled=false,updated_at=now() where customer_id=$1',[customerId]);
            await client.query('update time_card_confirmation_settings set automation_enabled=false,updated_at=now() where customer_id=$1',[customerId]);
            await client.query('commit');
          } catch (error) { await client.query('rollback'); throw error; }
          finally { client.release(); }
        }
      });
    }
  });
}
