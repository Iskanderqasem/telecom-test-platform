package com.telecom.testagent

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.util.Log

/**
 * SmsReceiver — intercepts incoming SMS messages and stores them
 * in AgentState so the /state endpoint can report them immediately
 * without needing to query the content provider.
 */
class SmsReceiver : BroadcastReceiver() {

    companion object {
        const val TAG = "SmsReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
        if (messages.isNullOrEmpty()) return

        // Reconstruct full message body (may be split across multiple PDUs)
        val sender = messages[0].originatingAddress ?: "unknown"
        val body = messages.joinToString("") { it.messageBody ?: "" }
        val timestamp = messages[0].timestampMillis

        Log.d(TAG, "SMS received from $sender: $body")

        AgentState.lastSmsSender = sender
        AgentState.lastSmsReceived = body
        AgentState.lastSmsTimestamp = timestamp
        AgentState.smsCountReceived++
    }
}
