package com.telecom.testagent

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.telecom.TelecomManager
import android.telephony.TelephonyManager
import android.util.Log

/**
 * CallReceiver — listens for incoming calls.
 * When autoAnswerArmed is true, answers the call automatically.
 * This is what allows the B-party to auto-answer without user interaction.
 */
class CallReceiver : BroadcastReceiver() {

    companion object {
        const val TAG = "CallReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != "android.intent.action.PHONE_STATE") return

        val state = intent.getStringExtra(TelephonyManager.EXTRA_STATE)
        val incomingNumber = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER)

        Log.d(TAG, "Phone state: $state, number: $incomingNumber")

        when (state) {
            TelephonyManager.EXTRA_STATE_RINGING -> {
                AgentState.lastIncomingNumber = incomingNumber
                Log.d(TAG, "Incoming call from: $incomingNumber, autoAnswer=${AgentState.autoAnswerArmed}")

                if (AgentState.autoAnswerArmed) {
                    Log.d(TAG, "Auto-answering call...")
                    Thread.sleep(1500) // brief delay so the system is ready
                    answerCall(context)
                    AgentState.callAnsweredAt = System.currentTimeMillis()
                }
            }
            TelephonyManager.EXTRA_STATE_OFFHOOK -> {
                Log.d(TAG, "Call answered/active")
            }
            TelephonyManager.EXTRA_STATE_IDLE -> {
                Log.d(TAG, "Call ended")
            }
        }
    }

    private fun answerCall(context: Context) {
        try {
            val telecomManager = context.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                telecomManager.acceptRingingCall()
                Log.d(TAG, "Call answered via TelecomManager.acceptRingingCall()")
                return
            }
        } catch (e: Exception) {
            Log.w(TAG, "acceptRingingCall failed: ${e.message}")
        }

        // Fallback for older Android
        try {
            val intent = Intent(Intent.ACTION_MEDIA_BUTTON)
            intent.putExtra(Intent.EXTRA_KEY_EVENT,
                android.view.KeyEvent(android.view.KeyEvent.ACTION_DOWN, android.view.KeyEvent.KEYCODE_HEADSETHOOK))
            context.sendOrderedBroadcast(intent, null)
            Log.d(TAG, "Call answered via HEADSETHOOK broadcast")
        } catch (e: Exception) {
            Log.e(TAG, "All answer methods failed: ${e.message}")
        }
    }
}
