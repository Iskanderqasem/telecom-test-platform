package com.telecom.testagent

/**
 * Shared state singleton — holds real-time data observed by receivers
 * and read by the HTTP server's /state endpoint.
 */
object AgentState {
    // Call state
    @Volatile var autoAnswerArmed: Boolean = false
    @Volatile var lastIncomingNumber: String? = null
    @Volatile var callAnsweredAt: Long = 0L

    // SMS state
    @Volatile var lastSmsReceived: String? = null
    @Volatile var lastSmsSender: String? = null
    @Volatile var lastSmsTimestamp: Long = 0L
    @Volatile var smsCountReceived: Int = 0
}
