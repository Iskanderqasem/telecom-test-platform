package com.telecom.testagent

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.telephony.TelephonyManager
import android.widget.Button
import android.widget.Switch
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

/**
 * MainActivity — shows the agent status, controls, and permission setup.
 * The user only needs to open this app ONCE to grant permissions.
 * After that the agent runs in the background automatically.
 */
class MainActivity : AppCompatActivity() {

    companion object {
        const val PERMISSION_REQUEST_CODE = 1001
    }

    private val handler = Handler(Looper.getMainLooper())
    private lateinit var tvStatus: TextView
    private lateinit var tvCallState: TextView
    private lateinit var tvLastSms: TextView
    private lateinit var tvPermissions: TextView
    private lateinit var btnStartStop: Button
    private lateinit var switchAutoAnswer: Switch
    private var serviceRunning = false

    private val REQUIRED_PERMISSIONS = buildList {
        add(Manifest.permission.CALL_PHONE)
        add(Manifest.permission.READ_PHONE_STATE)
        add(Manifest.permission.READ_CALL_LOG)
        add(Manifest.permission.ANSWER_PHONE_CALLS)
        add(Manifest.permission.SEND_SMS)
        add(Manifest.permission.RECEIVE_SMS)
        add(Manifest.permission.READ_SMS)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            add(Manifest.permission.POST_NOTIFICATIONS)
        }
    }.toTypedArray()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        tvStatus = findViewById(R.id.tvStatus)
        tvCallState = findViewById(R.id.tvCallState)
        tvLastSms = findViewById(R.id.tvLastSms)
        tvPermissions = findViewById(R.id.tvPermissions)
        btnStartStop = findViewById(R.id.btnStartStop)
        switchAutoAnswer = findViewById(R.id.switchAutoAnswer)

        btnStartStop.setOnClickListener {
            if (serviceRunning) stopAgent() else startAgent()
        }

        switchAutoAnswer.setOnCheckedChangeListener { _, checked ->
            AgentState.autoAnswerArmed = checked
            tvStatus.text = if (checked)
                "Auto-answer ENABLED — B-party will answer automatically"
            else
                "Auto-answer OFF — calls will ring normally"
        }

        checkAndRequestPermissions()
        startAgent()
        startStatusRefresh()
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        super.onDestroy()
    }

    private fun startAgent() {
        val intent = Intent(this, AgentService::class.java).apply {
            action = AgentService.ACTION_START
        }
        startForegroundService(intent)
        serviceRunning = true
        btnStartStop.text = "Stop Agent"
        tvStatus.text = "Agent running on port ${TelecomTestAgentServer.PORT}"
    }

    private fun stopAgent() {
        val intent = Intent(this, AgentService::class.java).apply {
            action = AgentService.ACTION_STOP
        }
        startService(intent)
        serviceRunning = false
        btnStartStop.text = "Start Agent"
        tvStatus.text = "Agent stopped"
    }

    private fun startStatusRefresh() {
        handler.post(object : Runnable {
            override fun run() {
                refreshStatus()
                handler.postDelayed(this, 1000)
            }
        })
    }

    private fun refreshStatus() {
        val tm = getSystemService(TELEPHONY_SERVICE) as TelephonyManager
        val callState = when (tm.callState) {
            TelephonyManager.CALL_STATE_IDLE -> "IDLE"
            TelephonyManager.CALL_STATE_RINGING -> "RINGING ☎"
            TelephonyManager.CALL_STATE_OFFHOOK -> "OFFHOOK (in call) 📞"
            else -> "UNKNOWN"
        }
        tvCallState.text = "Call State: $callState"

        val sms = AgentState.lastSmsReceived
        val sender = AgentState.lastSmsSender
        tvLastSms.text = if (sms != null)
            "Last SMS from $sender:\n\"$sms\"\n(Total received: ${AgentState.smsCountReceived})"
        else
            "No SMS received yet"

        switchAutoAnswer.isChecked = AgentState.autoAnswerArmed
    }

    private fun checkAndRequestPermissions() {
        val missing = REQUIRED_PERMISSIONS.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }

        if (missing.isEmpty()) {
            tvPermissions.text = "✅ All permissions granted"
        } else {
            tvPermissions.text = "⚠ Missing: ${missing.joinToString { it.substringAfterLast('.') }}\nTap to grant →"
            tvPermissions.setOnClickListener {
                ActivityCompat.requestPermissions(this, missing.toTypedArray(), PERMISSION_REQUEST_CODE)
            }
            ActivityCompat.requestPermissions(this, missing.toTypedArray(), PERMISSION_REQUEST_CODE)
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int, permissions: Array<String>, grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == PERMISSION_REQUEST_CODE) {
            val denied = permissions.zip(grantResults.toList())
                .filter { it.second != PackageManager.PERMISSION_GRANTED }
                .map { it.first.substringAfterLast('.') }

            if (denied.isEmpty()) {
                tvPermissions.text = "✅ All permissions granted"
            } else {
                tvPermissions.text = "❌ Still missing: ${denied.joinToString()}\nGo to Settings > Apps > TelecomTestAgent > Permissions"
            }
        }
    }
}
