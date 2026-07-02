require('dotenv').config();
const { Pool } = require('pg');

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    // Sample handsets
    await pool.query(`INSERT INTO handsets (label, make, model, adb_serial, msisdn, operator, network_type, profile, status)
      VALUES
        ('A', 'Samsung', 'Galaxy A54', 'SERIAL_A_REPLACE', '+64211000001', '2degrees', 'VoLTE', 'Prepaid', 'available'),
        ('B', 'Samsung', 'Galaxy A54', 'SERIAL_B_REPLACE', '+64211000002', '2degrees', 'VoWiFi', 'Postpaid', 'available')
      ON CONFLICT (label) DO NOTHING`);

    // Sample test cases matching the spreadsheet format exactly
    await pool.query(`INSERT INTO test_cases
      (tc_id, traceability_label, flow, environment, description,
       a_party_msisdn, a_party_network, a_party_profile, a_party_handset_label,
       b_party_msisdn, b_party_network, b_party_profile, b_party_handset_label,
       exp_call_mo, exp_call_mt, exp_sms, exp_sms_notification, exp_delivery_report,
       call_duration_seconds, call_type, sms_text, assigned_to, sort_order)
      VALUES
        ('SMSC-001','A, B, C, AS, O, AX','P2P','Prod',
         'Send & Receive SMS (Mobile Originated & Mobile Terminated)',
         '+64211000001','2D - VoLTE','Prepaid','A',
         '+64211000002','2D - VoWiFi','Postpaid','B',
         'Y','Y','Y','Y','N',15,'VoLTE','Test 123','Eskandar',1),

        ('Call-001','A, B, C, O, AX','On-net > On-net','Prod',
         'VoLTE to VoLTE Call - Mobile Originated & Mobile Terminated',
         '+64211000001','2D - VoLTE','Prepaid','A',
         '+64211000002','2D - VoLTE','Postpaid','B',
         'Y','Y','N','N','N',15,'VoLTE','','Eskandar',2),

        ('Call-002','A, B, C, O, AX','On-net > Off-net','Prod',
         'Call on-net Mobile Originated > Receive Call Off-net Mobile Terminated',
         '+64211000001','2D - VoLTE','Prepaid','A',
         '+64211000002','2D - VoLTE','Prepaid','B',
         'Y','Y','N','N','N',20,'VoLTE','','Eskandar',3),

        ('SMSC-002','A, B, C','P2P','Preprod',
         'Send & Receive SMS VoLTE to VoLTE',
         '+64211000001','2D - VoLTE','Prepaid','A',
         '+64211000002','2D - VoLTE','Prepaid','B',
         'Y','Y','Y','Y','N',15,'VoLTE','Test for CR 123','Eskandar',4)
      ON CONFLICT DO NOTHING`);

    console.log('Seed data applied.');
  } finally { await pool.end(); }
}

run().catch(e => { console.error(e); process.exit(1); });
