package com.telecom.testagent

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.IBinder
import android.os.PowerManager
import android.util.Log

/**
 * AgentService — foreground service that starts and keeps alive the
 * HTTP server on port 8765. Runs as a foreground service so Android
 * does not kill it during long test executions.
 */
class AgentService : Service() {

    companion object {
        const val TAG = "AgentService"
        const val CHANNEL_ID = "telecom_agent_channel"
        const val NOTIFICATION_ID = 1001
        const val ACTION_START = "com.telecom.testagent.ACTION_START"
        const val ACTION_STOP = "com.telecom.testagent.ACTION_STOP"
    }

    private var server: TelecomTestAgentServer? = null
    private var wakeLock: PowerManager.WakeLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        Log.d(TAG, "AgentService created")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopServer()
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                return START_NOT_STICKY
            }
        }

        startForeground(NOTIFICATION_ID, buildNotification("Running — port 8765"))
        acquireWakeLock()
        startServer()

        return START_STICKY // restart if killed
    }

    override fun onDestroy() {
        stopServer()
        releaseWakeLock()
        super.onDestroy()
    }

    private fun startServer() {
        if (server?.isAlive == true) {
            Log.d(TAG, "Server already running")
            return
        }
        try {
            server = TelecomTestAgentServer(applicationContext, AgentState)
            server!!.start()
            Log.d(TAG, "HTTP server started on port ${TelecomTestAgentServer.PORT}")
            updateNotification("Running — port ${TelecomTestAgentServer.PORT}")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start server", e)
            updateNotification("Error: ${e.message}")
        }
    }

    private fun stopServer() {
        server?.stop()
        server = null
        Log.d(TAG, "HTTP server stopped")
    }

    private fun acquireWakeLock() {
        val pm = getSystemService(POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "TelecomTestAgent::AgentWakeLock"
        )
        wakeLock?.acquire(12 * 60 * 60 * 1000L) // 12 hours max
    }

    private fun releaseWakeLock() {
        if (wakeLock?.isHeld == true) wakeLock?.release()
        wakeLock = null
    }

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Telecom Test Agent",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "HTTP agent service for telecom test automation"
            setShowBadge(false)
        }
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(channel)
    }

    private fun buildNotification(status: String): Notification {
        val openIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE
        )
        val stopIntent = PendingIntent.getService(
            this, 1,
            Intent(this, AgentService::class.java).apply { action = ACTION_STOP },
            PendingIntent.FLAG_IMMUTABLE
        )

        return Notification.Builder(this, CHANNEL_ID)
            .setContentTitle("Telecom Test Agent")
            .setContentText(status)
            .setSmallIcon(android.R.drawable.ic_menu_call)
            .setContentIntent(openIntent)
            .setOngoing(true)
            .addAction(android.R.drawable.ic_delete, "Stop", stopIntent)
            .build()
    }

    private fun updateNotification(status: String) {
        val nm = getSystemService(NotificationManager::class.java)
        nm.notify(NOTIFICATION_ID, buildNotification(status))
    }
}
