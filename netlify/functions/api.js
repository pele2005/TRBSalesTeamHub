// ไฟล์นี้จะต้องอยู่ในโฟลเดอร์ netlify/functions/ ภายในโปรเจคของคุณ
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

// --- ข้อมูลสำคัญที่ต้องตั้งค่าใน Environment Variables ของ Netlify ---
// 1. GOOGLE_SERVICE_ACCOUNT_CREDS_JSON: ข้อมูล service account ในรูปแบบ JSON
// 2. USER_SHEET_ID: ID ของ Google Sheet ที่เก็บ Username/Password (1E-1fKvOG2Yd88RM3WmTAKEzB-Ve1uBuFyDXKGc-ehXY)
// 3. PERMISSION_SHEET_ID: ID ของ Google Sheet ที่เก็บสิทธิ์ (1LXyGjplIU6WZPF-0Ty10aOO_Dl2Kq_lO7EqdhjtZl80)

const getServiceAccountAuth = () => {
    try {
        const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_CREDS_JSON);
        return new JWT({
            email: creds.client_email,
            key: creds.private_key,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
    } catch (error) {
        console.error("Failed to parse GOOGLE_SERVICE_ACCOUNT_CREDS_JSON:", error);
        throw new Error("Service Account credentials are not configured correctly.");
    }
};

// ฟังก์ชันสำหรับดึงสิทธิ์ของผู้ใช้
const getPermissionsForUser = async (auth, username) => {
    const permDoc = new GoogleSpreadsheet(process.env.PERMISSION_SHEET_ID, auth);
    await permDoc.loadInfo();
    const permSheet = permDoc.sheetsByTitle['permissionDashboard'];
    if (!permSheet) {
        throw new Error("Sheet 'permissionDashboard' not found.");
    }

    const rows = await permSheet.getRows();
    const userPermissions = [];
    
    // หาแถวของผู้ใช้ที่ตรงกัน
    const userRow = rows.find(row => String(row.get(permSheet.headerValues[0]) || '').trim() === username);

    if (userRow) {
        // วนลูปทุกคอลัมน์ในแถวนั้นเพื่อเก็บสิทธิ์ทั้งหมด
        permSheet.headerValues.slice(1).forEach(header => {
            const permission = String(userRow.get(header) || '').trim();
            if (permission) {
                userPermissions.push(permission);
            }
        });
    }

    return userPermissions;
};


exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };
    
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }

    try {
        const payload = JSON.parse(event.body);
        const action = payload.action;
        const auth = getServiceAccountAuth();

        if (action === 'login') {
            const doc = new GoogleSpreadsheet(process.env.USER_SHEET_ID, auth);
            await doc.loadInfo();
            const sheet = doc.sheetsByTitle['ข้อมูลusername & password']; // Corrected sheet name
            
            if (!sheet) {
                throw new Error("Sheet 'ข้อมูลusername & password' not found.");
            }

            const rows = await sheet.getRows();
            const userHeader = sheet.headerValues[0]; // 'Cost_center'
            const passHeader = sheet.headerValues[1]; // 'password'

            const user = rows.find(row => 
                String(row.get(userHeader) || '').trim() === String(payload.username).trim() && 
                String(row.get(passHeader) || '').trim() === String(payload.password).trim()
            );

            if (user) {
                // ถ้า login สำเร็จ ให้ดึงสิทธิ์ (permissions) ต่อ
                const permissions = await getPermissionsForUser(auth, payload.username);
                return { 
                    statusCode: 200, 
                    headers, 
                    body: JSON.stringify({ success: true, permissions: permissions }) 
                };
            } else {
                return { statusCode: 401, headers, body: JSON.stringify({ success: false, message: 'Cost Center หรือรหัสผ่านไม่ถูกต้อง' }) };
            }
        }

        return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Invalid action' }) };

    } catch (error) {
        console.error('API Error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ success: false, message: 'เกิดข้อผิดพลาดภายใน Server: ' + error.message })
        };
    }
};


