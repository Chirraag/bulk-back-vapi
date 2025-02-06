import fetch from "node-fetch";
import { logger } from "../utils/logger.js";
import { db } from "../lib/firebase.js";
import {
  collection,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  getDocFromServer,
  query,
} from "firebase/firestore";
import { format, utcToZonedTime } from "date-fns-tz";

const VAPI_API_KEY =
  process.env.VAPI_API_KEY || "a74661c9-f98f-4af0-afa4-00a0e80ce133";
const ASSISTANT_ID = "ed3e0153-8bf9-4c08-99a2-3cd9f250fd9a";
const PHONE_NUMBER_ID = "2b19cec6-a026-47fe-8d62-b93a0685aafc";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function makeCall(
  phoneNumber: string,
  name: string,
  projectName: string,
  unitNumber: string,
  assisstantId: string,
  phoneNumberId: string,
) {
  try {
    console.log(phoneNumber);
    console.log(name);
    const response = await fetch("https://api.vapi.ai/call", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${VAPI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        assistantId: assisstantId,
        customer: {
          number: "+" + phoneNumber,
          name: name,
        },
        phoneNumberId: phoneNumberId,
        assistantOverrides: {
          variableValues: {
            name: name,
            projectName: projectName,
            unit_number: unitNumber,
          },
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to make call: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    logger.error("Error making call:", error);
    throw error;
  }
}

async function checkCampaignStatus(campaignId: string): Promise<string | null> {
  try {
    const campaignDocRef = doc(db, "campaigns", campaignId);
    const campaignSnap = await getDocFromServer(campaignDocRef, {
      fieldMask: ["status"],
    });

    if (!campaignSnap.exists()) return "in-progress";
    return campaignSnap.get("status") || "in-progress";
  } catch (error) {
    logger.error(`Error checking campaign status for ${campaignId}:`, error);
    return "in-progress";
  }
}

// export async function processCampaignCalls(campaignId: string) {
//   try {
//     logger.info(`Starting campaign calls for campaign: ${campaignId}`);

//     // Get campaign contacts
//     const contactsRef = collection(db, `campaigns/${campaignId}/contacts`);
//     const contactsSnapshot = await getDocs(contactsRef);
//     const contacts = contactsSnapshot.docs.map((doc) => ({
//       id: doc.id,
//       ...doc.data(),
//     }));

//     let status = await checkCampaignStatus(campaignId);

//     // If campaign is ended or doesn't exist, stop processing
//     if (!status || status === "ended") {
//       logger.info(
//         `Campaign ${campaignId} has been ended. Stopping further calls.`,
//       );
//       return;
//     }

//     // Update campaign status to 'in-progress'
//     const campaignRef = doc(db, "campaigns", campaignId);
//     await updateDoc(campaignRef, { status: "in-progress" });

//     let callCount = 0;

//     console.log(contacts.length);

//     for (const contact of contacts) {
//       console.log(contact);
//       if (!contact.called) {
//         try {
//           status = await checkCampaignStatus(campaignId);

//           // If campaign is ended or doesn't exist, stop processing
//           if (!status || status === "ended") {
//             logger.info(
//               `Campaign ${campaignId} has been ended. Stopping further calls.`,
//             );
//             return;
//           }
//           // Make the call
//           const call_response = await makeCall(
//             contact.phone_number,
//             contact.name || "",
//           );

//           // Update contact status
//           const contactRef = doc(
//             db,
//             `campaigns/${campaignId}/contacts`,
//             contact.id,
//           );
//           await updateDoc(contactRef, {
//             call_id: call_response.id,
//             called: true,
//             called_at: new Date().toISOString(),
//           });

//           // Update campaign stats
//           await updateDoc(campaignRef, {
//             contacts_called: callCount + 1,
//           });

//           callCount++;

//           // Wait 1 second between calls
//           await sleep(1000);

//           // If we've made 10 calls, wait for 10 seconds
//           if (callCount % 10 === 0) {
//             logger.info("Pausing for 10 seconds after 10 calls");
//             await sleep(10000);
//           }
//         } catch (error) {
//           logger.error(
//             `Error processing call for contact ${contact.id}:`,
//             error,
//           );
//           const contactRef = doc(
//             db,
//             `campaigns/${campaignId}/contacts`,
//             contact.id,
//           );
//           await updateDoc(contactRef, {
//             called: "Error",
//             called_at: new Date().toISOString(),
//           });
//           continue; // Continue with next contact even if one fails
//         }
//       }
//     }

//     // Update campaign status to completed
//     await updateDoc(campaignRef, {
//       status: "completed",
//       completed_at: new Date().toISOString(),
//     });

//     logger.info(
//       `Campaign ${campaignId} completed. Total calls made: ${callCount}`,
//     );
//   } catch (error) {
//     logger.error("Error processing campaign:", error);
//     throw error;
//   }
// }

export async function processCampaignCalls(campaignId: string) {
  try {
    logger.info(`Starting campaign calls for campaign: ${campaignId}`);

    // Get campaign contacts
    const contactsRef = collection(db, `campaigns/${campaignId}/contacts`);
    const contactsSnapshot = await getDocs(contactsRef);
    const contacts = contactsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    const campaignDoc = await getDoc(doc(db, "campaigns", campaignId));
    if (!campaignDoc.exists()) {
      logger.error(`Campaign ${campaignId} not found`);
      return;
    }

    const campaign = campaignDoc.data();
    const {
      start_time,
      end_time,
      timezone,
      assistantId,
      campaign_end_date,
      contacts_called,
      phoneNumberId,
    } = campaign;

    let status = await checkCampaignStatus(campaignId);

    // If campaign is ended or doesn't exist, stop processing
    if (!status || status === "ended") {
      logger.info(
        `Campaign ${campaignId} has been ended. Stopping further calls.`,
      );
      return;
    }

    // Update campaign status to 'in-progress'
    const campaignRef = doc(db, "campaigns", campaignId);
    await updateDoc(campaignRef, { status: "in-progress" });

    let callCount = contacts_called ?? 0;

    if (!(await isWithinCampaignHours(start_time, end_time, timezone))) {
      logger.info(
        `Campaign ${campaignId} outside of operating hours. Skipping calls.`,
      );
      return;
    }

    for (const contact of contacts) {
      try {
        if (!(await isWithinCampaignHours(start_time, end_time, timezone))) {
          logger.info(
            `Campaign ${campaignId} reached end time. Stopping further calls.`,
          );
          return;
        }

        status = await checkCampaignStatus(campaignId);
        if (!status || status === "ended") {
          logger.info(
            `Campaign ${campaignId} has been ended. Stopping further calls.`,
          );
          return;
        }

        let shouldCall = false;

        // Check if contact should be called
        if (!contact.called || contact.called === "Error") {
          shouldCall = true;
        } else if (contact.call_id) {
          // Check call status in calls collection
          const callDoc = await getDoc(doc(db, "calls", contact.call_id));

          if (!callDoc.exists()) {
            // Call not found in DB, fetch from VAPI
            try {
              const response = await fetch(
                `https://api.vapi.ai/call/${contact.call_id}`,
                {
                  headers: {
                    Authorization: `Bearer ${VAPI_API_KEY}`,
                  },
                },
              );

              if (response.ok) {
                const callData = await response.json();
                if (callData.status === "ended") {
                  // Store call data
                  await setDoc(doc(db, "calls", contact.call_id), callData);

                  // Check if call should be retried
                  if (
                    callData.endedReason === "customer-did-not-answer" ||
                    callData.analysis?.structuredData[
                      "post-call-intent-analysis"
                    ] === "callback"
                  ) {
                    shouldCall = true;
                  }
                }
              } else {
                // If API call fails, retry the call
                shouldCall = true;
              }
            } catch (error) {
              logger.error(
                `Error fetching call data from VAPI for ${contact.call_id}:`,
                error,
              );
              shouldCall = true;
            }
          } else {
            const callData = callDoc.data();
            if (
              callData.endedReason === "customer-did-not-answer" ||
              callData.analysis?.structuredData["post-call-intent-analysis"] ===
                "callback"
            ) {
              shouldCall = true;
            }
          }
        }

        if (shouldCall) {
          // Make the call
          const call_response = await makeCall(
            contact.phone_number,
            contact.name || "",
            contact.project_name || "",
            contact.unit_number || "",
            assistantId || ASSISTANT_ID,
            phoneNumberId || PHONE_NUMBER_ID,
          );

          // Update contact status
          const contactRef = doc(
            db,
            `campaigns/${campaignId}/contacts`,
            contact.id,
          );
          await updateDoc(contactRef, {
            call_id: call_response.id,
            called: true,
            called_at: new Date().toISOString(),
          });

          // Update campaign stats
          await updateDoc(campaignRef, {
            contacts_called: callCount + 1,
          });

          callCount++;

          // Wait 1 second between calls
          await sleep(2500);

          // If we've made 10 calls, wait for 10 seconds
          if (callCount % 10 === 0) {
            logger.info("Pausing for 10 seconds after 10 calls");
            await sleep(15000);
          }
        }
      } catch (error) {
        logger.error(`Error processing call for contact ${contact.id}:`, error);
        const contactRef = doc(
          db,
          `campaigns/${campaignId}/contacts`,
          contact.id,
        );
        await updateDoc(contactRef, {
          called: "Error",
          error: error.message,
          called_at: new Date().toISOString(),
        });
        await sleep(10000);
        continue; // Continue with next contact even if one fails
      }
    }

    // Check if the campaign end date has passed in the specified timezone
    const now = new Date();
    const currentDateInTimezone = utcToZonedTime(now, timezone);
    const formattedCurrentDate = format(currentDateInTimezone, "yyyy-MM-dd");
    const campaignEndDate = format(
      utcToZonedTime(new Date(campaign_end_date), timezone),
      "yyyy-MM-dd",
    );

    if (formattedCurrentDate >= campaignEndDate) {
      await updateDoc(campaignRef, {
        status: "completed",
        completed_at: new Date().toISOString(),
      });
      logger.info(
        `Campaign ${campaignId} completed. Total calls made: ${callCount}`,
      );
    }

    // Update campaign status to completed
    // await updateDoc(campaignRef, {
    //   status: "completed",
    //   completed_at: new Date().toISOString(),
    // });
  } catch (error) {
    logger.error("Error processing campaign:", error);
    throw error;
  }
}

async function isWithinCampaignHours(
  start_time: string,
  end_time: string,
  timezone: string,
): Promise<boolean> {
  try {
    // Get current time in campaign timezone
    const now = utcToZonedTime(new Date(), timezone);
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    // Convert campaign times to minutes for comparison
    const [startHour, startMinute] = start_time.split(":").map(Number);
    const [endHour, endMinute] = end_time.split(":").map(Number);

    const currentTimeInMinutes = currentHour * 60 + currentMinute;
    const startTimeInMinutes = startHour * 60 + startMinute;
    const endTimeInMinutes = endHour * 60 + endMinute;

    // Check if current time is within campaign hours
    return (
      currentTimeInMinutes >= startTimeInMinutes &&
      currentTimeInMinutes <= endTimeInMinutes
    );
  } catch (error) {
    logger.error("Error checking campaign hours:", error);
    return false;
  }
}
