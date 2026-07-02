package com.telecom.testagent

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * BootReceiver — automatically restarts the agent service after
 * the phone reboots. This means you never need to manually open
 * the app after connecting a phone — it's always ready.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            Log.d("BootReceiver", "Boot completed — starting agent service")
            val serviceIntent = Intent(context, AgentService::class.java).apply {
                action = AgentService.ACTION_START
            }
            context.startForegroundService(serviceIntent)
        }
    }
}
