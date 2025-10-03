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
    console.log(`[PERMISSIONS] Starting permission lookup for user: "${username}"`);
    const permDoc = new GoogleSpreadsheet(process.env.PERMISSION_SHEET_ID, auth);
    await permDoc.loadInfo();
    
    const permSheet = permDoc.sheetsByTitle['permissionDashboard']; 

    if (!permSheet) {
        const errorMessage = "Error: Could not find a sheet with the exact name 'permissionDashboard'.";
        console.error(`[PERMISSIONS] ${errorMessage}`);
        throw new Error(errorMessage);
    }
    
    const rows = await permSheet.getRows();
    const usernameHeader = permSheet.headerValues[0];

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
    
    if (!userRow) {
        console.log(`[PERMISSIONS] User "${username}" NOT FOUND in the permission sheet.`);
        return permissions;
    }

    console.log(`[PERMISSIONS] User "${username}" FOUND. Reading permissions from row.`);

    const levelUpValues = ["1MS", "1UNE", "2BA", "2BC", "2BG", "2UNE", "2US", "5BA"];
    const smValues = ["OPH BKK1", "OPH BKK2", "OPH BKK3", "OPH UPC1", "OPH UPC2", "OPH UPC3", "ORT BKK1", "ORT BKK2", "ORT UPC1", "ORT UPC2", "OTC BKK", "OTC UPC"];

    for (let i = 1; i < permSheet.headerValues.length; i++) {
        const header = permSheet.headerValues[i];
        const permissionValue = userRow.get(header);

        if (permissionValue && String(permissionValue).trim() !== '') {
            const cleanPermission = String(permissionValue).trim();
            console.log(`[PERMISSIONS] Found permission value in cell: "${cleanPermission}"`);
            
            if (cleanPermission.toLowerCase() === 'trb') {
                permissions.showTRB = true;
            } else if (cleanPermission.toLowerCase() === 'nsm') {
                permissions.showNSM = true;
            } else if (cleanPermission.toLowerCase() === 'admin') {
                permissions.showAdmin = true;
            } 
            else if (levelUpValues.includes(cleanPermission)) {
                permissions.levelUp.push(cleanPermission);
            }
            else if (smValues.includes(cleanPermission)) {
                permissions.sm.push(cleanPermission);
            }
        }
    }
    
    console.log(`[PERMISSIONS] Final permissions object for "${username}":`, JSON.stringify(permissions));
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
            
            const userDoc = new GoogleSpreadsheet(process.env.USER_SHEET_ID, auth);
            await userDoc.loadInfo();
            const userSheet = userDoc.sheetsByIndex[0];
             if (!userSheet) {
                throw new Error("Could not find the user sheet.");
            }
            const userRows = await userSheet.getRows();
            const userHeader = userSheet.headerValues[0];
            const passHeader = userSheet.headerValues[1];

            const user = userRows.find(row => 
                String(row.get(userHeader) || '').trim().toLowerCase() === String(username).trim().toLowerCase() && 
                String(row.get(passHeader) || '').trim() === String(password).trim()
            );

            if (!user) {
                 return { statusCode: 401, headers, body: JSON.stringify({ success: false, message: 'Username หรือ Password ไม่ถูกต้อง' }) };
            }

            const permissions = await getPermissions(auth, username);
            const officialUsername = user.get(userHeader);

            return { 
                statusCode: 200, 
                headers, 
                body: JSON.stringify({ 
                    success: true,
                    username: officialUsername,
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

