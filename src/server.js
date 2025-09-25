              // STRATEGY 3: Use device name or create identifier
              const deviceName = userData.userInfo?.name || userData.deviceName || 'Unknown Device';
              
              // Try to extract a meaningful name from device name
              if (deviceName && deviceName !== 'Unknown Device') {
                // Extract name from device patterns like "Computer-John" or "DESKTOP-JOHNDOE"
                let nameMatch = deviceName.match(/(?:Computer-|DESKTOP-|PC-)([A-Za-z]+)/i);
                
                // NEW: Also try to extract from patterns like "Computer-TthUmwrm"
                if (!nameMatch) {
                  nameMatch = deviceName.match(/(?:Computer-|DESKTOP-|PC-)([A-Za-z0-9]+)/i);
                }
                
                if (nameMatch) {
                  let extractedName = nameMatch[1];
                  
                  // Clean up the extracted name
                  if (extractedName.length >= 3) {
                    // Capitalize first letter, lowercase the rest
                    realUserName = extractedName.charAt(0).toUpperCase() + extractedName.slice(1).toLowerCase();
                    realUserEmail = `${extractedName.toLowerCase()}@company.com`;
                    lookupMethod = 'device_name_extraction';
                    console.log(`✅ Strategy 3: Extracted from device name: ${realUserName}`);
                  } else {
                    // Name too short, use full device name
                    realUserName = `User of ${deviceName}`;
                    realUserEmail = `user.${deviceName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}@company.com`;
                    lookupMethod = 'device_name_fallback';
                    console.log(`✅ Strategy 3: Using device name: ${realUserName}`);
                  }
                } else {
                  realUserName = `User of ${deviceName}`;
                  realUserEmail = `user.${deviceName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}@company.com`;
                  lookupMethod = 'device_name_fallback';
                  console.log(`✅ Strategy 3: Using device name: ${realUserName}`);
                }
              } else {
                // STRATEGY 4: Use userId as identifier
                realUserName = `User ${userId.substring(0, 8)}`;
                realUserEmail = `user.${userId.substring(0, 8)}@company.com`;
                lookupMethod = 'userid_fallback';
                console.log(`✅ Strategy 4: Using userId fallback: ${realUserName}`);
              }