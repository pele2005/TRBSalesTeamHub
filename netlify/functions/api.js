const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

// Environment Variables required by Netlify:
// 1. GOOGLE_SERVICE_ACCOUNT_CREDS_JSON
// 2. USER_SHEET_ID
// 3. PERMISSION_SHEET_ID

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

const getPermissions = async (auth, username) => {
    const permDoc = new GoogleSpreadsheet(process.env.PERMISSION_SHEET_ID, auth);
    await permDoc.loadInfo();
    const permSheet = permDoc.sheetsByIndex[0]; // Assumes 'permissionDashboard' is the first tab

    if (!permSheet) {
        throw new Error("Could not find the 'permissionDashboard' sheet.");
    }
    
    const rows = await permSheet.getRows();
    const usernameHeader = permSheet.headerValues[0]; // Assuming username is in the first column 'A'

    // --- FIX HERE: Made the username comparison case-insensitive ---
    const userRow = rows.find(row => 
        String(row.get(usernameHeader) || '').trim().toLowerCase() === String(username).trim().toLowerCase()
    );

    const permissions = {
        showTRB: false,
        showNSM: false,
        showAdmin: false,
        levelUp: [],
        sm: [],
    };

    if (userRow) {
        // Check main permissions
        permissions.showTRB = !!userRow.get('TRB');   // Column B
        permissions.showNSM = !!userRow.get('NSM');   // Column C
        permissions.showAdmin = !!userRow.get('Admin'); // Column F

        // Gather specific permissions for Level-Up and SM
        const levelUpHeader = 'Level-Up'; // Column D
        const smHeader = 'SM';         // Column E

        if (userRow.get(levelUpHeader)) {
            permissions.levelUp.push(userRow.get(levelUpHeader).trim());
        }
        if (userRow.get(smHeader)) {
            permissions.sm.push(userRow.get(smHeader).trim());
        }
    }

    return permissions;
};


exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };
    
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: JSON.stringify({ message: 'Successful preflight call.' }) };
    }

    try {
        const payload = JSON.parse(event.body);
        const action = payload.action;
        const auth = getServiceAccountAuth();

        if (action === 'login') {
            const { username, password } = payload;
            
            // 1. Authenticate user
            const userDoc = new GoogleSpreadsheet(process.env.USER_SHEET_ID, auth);
            await userDoc.loadInfo();
            const userSheet = userDoc.sheetsByIndex[0]; // Assumes user data is in the first sheet
             if (!userSheet) {
                throw new Error("Could not find the user sheet.");
            }
            const userRows = await userSheet.getRows();
            const userHeader = userSheet.headerValues[0]; // 'Cost_center'
            const passHeader = userSheet.headerValues[1]; // 'password'

            const user = userRows.find(row => 
                String(row.get(userHeader) || '').trim().toLowerCase() === String(username).trim().toLowerCase() && 
                String(row.get(passHeader) || '').trim() === String(password).trim()
            );

            if (!user) {
                 return { statusCode: 401, headers, body: JSON.stringify({ success: false, message: 'Username หรือ Password ไม่ถูกต้อง' }) };
            }

            // 2. Get permissions for the authenticated user
            const permissions = await getPermissions(auth, username);

            return { 
                statusCode: 200, 
                headers, 
                body: JSON.stringify({ 
                    success: true,
                    username: user.get(userHeader), // Return the correct-cased username
                    permissions: permissions 
                }) 
            };
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

