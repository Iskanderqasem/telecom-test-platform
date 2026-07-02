package com.telecom.testagent

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.telecom.TelecomManager
import android.telephony.SmsManager
import android.telephony.TelephonyManager
import android.util.Log
import com.google.gson.Gson
import com.google.gson.JsonObject
import fi.iki.elonen.NanoHTTPD
import java.io.InputStreamReader

/**
 * TelecomTestAgentServer — NanoHTTPD HTTP server running on port 8765.
 *
 * The backend connects to this server via ADB TCP forward:
 *   adb forward tcp:8765 tcp:8765
 *
 * Then calls:
 *   POST http://localhost:8765/dial      {"number": "+64266500271"}
 *   POST http://localhost:8765/answer
 *   POST http://localhost:8765/hangup
 *   POST http://localhost:8765/sms       {"number": "+64266500271", "text": "Test 123"}
 *   GET  http://localhost:8765/state     → call state, SMS inbox snapshot
 *   GET  http://localhost:8765/health    → OK + device info
 */
class TelecomTestAgentServer(
    private val context: Context,
    private val agentState: AgentState
) : NanoHTTPD(PORT) {

    companion object {
        const val PORT = 8765
        const val TAG = "TelecomAgent"
    }

    private val gson = Gson()
    private val telephonyManager = context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
    private val telecomManager = context.getSystemService(Context.TELECOM_SERVICE) as TelecomManager

    override fun serve(session: IHTTPSession): Response {
        val uri = session.uri
        val method = session.method
        Log.d(TAG, "Request: $method $uri")

        return try {
            when {
                uri == "/health" && method == Method.GET -> handleHealth()
                uri == "/state" && method == Method.GET -> handleState()
                uri == "/dial" && method == Method.POST -> handleDial(readBody(session))
                uri == "/answer" && method == Method.POST -> handleAnswer()
                uri == "/hangup" && method == Method.POST -> handleHangup()
                uri == "/sms" && method == Method.POST -> handleSms(readBody(session))
                uri == "/sms/inbox" && method == Method.GET -> handleSmsInbox()
                uri == "/data/enable" && method == Method.POST -> handleDataToggle(true)
                uri == "/data/disable" && method == Method.POST -> handleDataToggle(false)
                uri == "/screenshot" && method == Method.GET -> handleScreenshot()
                else -> jsonResponse(404, mapOf("error" to "Not found: $method $uri"))
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error handling $uri", e)
            jsonResponse(500, mapOf("error" to e.message, "type" to e.javaClass.simpleName))
        }
    }

    // ── /health ──────────────────────────────────────────────────────────────
    private fun handleHealth(): Response {
        return jsonResponse(200, mapOf(
            "status" to "ok",
            "app" to "TelecomTestAgent",
            "version" to "1.0.0",
            "android_version" to Build.VERSION.RELEASE,
            "model" to Build.MODEL,
            "manufacturer" to Build.MANUFACTURER,
            "api_level" to Build.VERSION.SDK_INT,
            "auto_answer_armed" to agentState.autoAnswerArmed,
            "last_incoming_number" to agentState.lastIncomingNumber,
            "last_sms_received" to agentState.lastSmsReceived
        ))
    }

    // ── /state ───────────────────────────────────────────────────────────────
    private fun handleState(): Response {
        val callState = telephonyManager.callState
        val callStateStr = when (callState) {
            TelephonyManager.CALL_STATE_IDLE -> "IDLE"
            TelephonyManager.CALL_STATE_RINGING -> "RINGING"
            TelephonyManager.CALL_STATE_OFFHOOK -> "OFFHOOK"
            else -> "UNKNOWN"
        }
        return jsonResponse(200, mapOf(
            "call_state" to callStateStr,
            "call_state_code" to callState,
            "auto_answer_armed" to agentState.autoAnswerArmed,
            "last_incoming_number" to agentState.lastIncomingNumber,
            "last_sms_received" to agentState.lastSmsReceived,
            "last_sms_sender" to agentState.lastSmsSender,
            "last_sms_timestamp" to agentState.lastSmsTimestamp,
            "sms_count_received" to agentState.smsCountReceived
        ))
    }

    // ── /dial ────────────────────────────────────────────────────────────────
    private fun handleDial(body: JsonObject): Response {
        val number = body.get("number")?.asString
            ?: return jsonResponse(400, mapOf("error" to "number is required"))

        Log.d(TAG, "Dialling: $number")

        // Use telecom manager directly — bypasses confirmation dialog
        val intent = Intent(Intent.ACTION_CALL, Uri.parse("tel:$number"))
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
        context.startActivity(intent)

        // Wait briefly then check state
        Thread.sleep(2000)
        val state = telephonyManager.callState
        val stateStr = when (state) {
            TelephonyManager.CALL_STATE_IDLE -> "IDLE"
            TelephonyManager.CALL_STATE_RINGING -> "RINGING"
            TelephonyManager.CALL_STATE_OFFHOOK -> "OFFHOOK"
            else -> "UNKNOWN"
        }

        return jsonResponse(200, mapOf(
            "dialled" to number,
            "call_state" to stateStr,
            "success" to (state != TelephonyManager.CALL_STATE_IDLE)
        ))
    }

    // ── /answer ──────────────────────────────────────────────────────────────
    private fun handleAnswer(): Response {
        Log.d(TAG, "Answering call...")
        var success = false
        var method = "none"

        // Method 1: TelecomManager.acceptRingingCall() — works Android 11+
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                telecomManager.acceptRingingCall()
                success = true
                method = "TelecomManager.acceptRingingCall"
                Log.d(TAG, "Answered via TelecomManager")
            }
        } catch (e: Exception) {
            Log.w(TAG, "TelecomManager.acceptRingingCall failed: ${e.message}")
        }

        // Method 2: Broadcast ANSWER intent
        if (!success) {
            try {
                val intent = Intent("android.intent.action.ANSWER")
                intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
                context.startActivity(intent)
                success = true
                method = "ANSWER_intent"
            } catch (e: Exception) {
                Log.w(TAG, "ANSWER intent failed: ${e.message}")
            }
        }

        Thread.sleep(1500)
        val state = telephonyManager.callState
        return jsonResponse(200, mapOf(
            "success" to success,
            "method" to method,
            "call_state" to when (state) {
                TelephonyManager.CALL_STATE_IDLE -> "IDLE"
                TelephonyManager.CALL_STATE_RINGING -> "RINGING"
                TelephonyManager.CALL_STATE_OFFHOOK -> "OFFHOOK"
                else -> "UNKNOWN"
            }
        ))
    }

    // ── /hangup ──────────────────────────────────────────────────────────────
    private fun handleHangup(): Response {
        Log.d(TAG, "Hanging up call...")
        var success = false

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                telecomManager.endCall()
                success = true
            }
        } catch (e: Exception) {
            Log.w(TAG, "telecomManager.endCall failed: ${e.message}")
        }

        return jsonResponse(200, mapOf("success" to success))
    }

    // ── /sms ─────────────────────────────────────────────────────────────────
    private fun handleSms(body: JsonObject): Response {
        val number = body.get("number")?.asString
            ?: return jsonResponse(400, mapOf("error" to "number is required"))
        val text = body.get("text")?.asString ?: "Test 123"

        Log.d(TAG, "Sending SMS to $number: $text")

        return try {
            val smsManager = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                context.getSystemService(SmsManager::class.java)
            } else {
                @Suppress("DEPRECATION")
                SmsManager.getDefault()
            }

            // Split long messages automatically
            if (text.length > 160) {
                val parts = smsManager.divideMessage(text)
                smsManager.sendMultipartTextMessage(number, null, parts, null, null)
            } else {
                smsManager.sendTextMessage(number, null, text, null, null)
            }

            jsonResponse(200, mapOf(
                "sent" to true,
                "to" to number,
                "text" to text,
                "length" to text.length
            ))
        } catch (e: Exception) {
            Log.e(TAG, "SMS send failed", e)
            jsonResponse(500, mapOf(
                "sent" to false,
                "error" to e.message
            ))
        }
    }

    // ── /sms/inbox ───────────────────────────────────────────────────────────
    private fun handleSmsInbox(): Response {
        val messages = mutableListOf<Map<String, Any?>>()
        try {
            val cursor = context.contentResolver.query(
                Uri.parse("content://sms/inbox"),
                arrayOf("_id", "address", "body", "date", "read"),
                null, null, "date DESC"
            )
            cursor?.use {
                val limit = 10
                var count = 0
                while (it.moveToNext() && count < limit) {
                    messages.add(mapOf(
                        "id" to it.getLong(it.getColumnIndexOrThrow("_id")),
                        "address" to it.getString(it.getColumnIndexOrThrow("address")),
                        "body" to it.getString(it.getColumnIndexOrThrow("body")),
                        "date" to it.getLong(it.getColumnIndexOrThrow("date")),
                        "read" to (it.getInt(it.getColumnIndexOrThrow("read")) == 1)
                    ))
                    count++
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "SMS inbox read failed", e)
        }

        return jsonResponse(200, mapOf(
            "count" to messages.size,
            "messages" to messages,
            "last_received_via_broadcast" to agentState.lastSmsReceived,
            "total_received_this_session" to agentState.smsCountReceived
        ))
    }

    // ── /data/enable|disable ─────────────────────────────────────────────────
    private fun handleDataToggle(enable: Boolean): Response {
        // Note: on most Android 11+ non-rooted devices, programmatic data toggle
        // requires system privilege. We attempt it but return status honestly.
        Log.d(TAG, "Data toggle: $enable")
        return jsonResponse(200, mapOf(
            "requested" to enable,
            "note" to "Data toggle via API requires system privilege on Android 11+. " +
                      "Use ADB: 'adb shell svc data ${if (enable) "enable" else "disable"}'"
        ))
    }

    // ── /screenshot ──────────────────────────────────────────────────────────
    private fun handleScreenshot(): Response {
        // Screenshots via the APK require MEDIA_PROJECTION which needs UI consent
        // The backend's ADB screencap is more reliable — return instructions
        return jsonResponse(200, mapOf(
            "note" to "Use ADB screencap for screenshots: adb -s <serial> shell screencap -p /sdcard/ss.png && adb pull /sdcard/ss.png"
        ))
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    private fun readBody(session: IHTTPSession): JsonObject {
        val map = HashMap<String, String>()
        session.parseBody(map)
        val body = map["postData"] ?: "{}"
        return try {
            gson.fromJson(body, JsonObject::class.java) ?: JsonObject()
        } catch (e: Exception) {
            JsonObject()
        }
    }

    private fun jsonResponse(statusCode: Int, data: Any): Response {
        val json = gson.toJson(data)
        val status = when (statusCode) {
            200 -> Response.Status.OK
            201 -> Response.Status.CREATED
            400 -> Response.Status.BAD_REQUEST
            404 -> Response.Status.NOT_FOUND
            500 -> Response.Status.INTERNAL_ERROR
            else -> Response.Status.OK
        }
        val response = newFixedLengthResponse(status, "application/json", json)
        response.addHeader("Access-Control-Allow-Origin", "*")
        return response
    }
}
