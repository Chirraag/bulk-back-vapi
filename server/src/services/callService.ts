import fetch from 'node-fetch';
import { logger } from '../utils/logger.js';
import { db } from '../lib/firebase.js';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';

const VAPI_API_KEY = process.env.VAPI_API_KEY || 'a74661c9-f98f-4af0-afa4-00a0e80ce133';
const ASSISTANT_ID = 'ed3e0153-8bf9-4c08-99a2-3cd9f250fd9a';
const PHONE_NUMBER_ID = 'a7043543-2130-47a5-8e28-63880c93b6b1';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function makeCall(phoneNumber: string, name: string) {
  try {
    const response = await fetch('https://api.vapi.ai/call', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${VAPI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        assistantId: ASSISTANT_ID,
        customer: {
          number: phoneNumber,
          name: name,
        },
        phoneNumberId: PHONE_NUMBER_ID,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to make call: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    logger.error('Error making call:', error);
    throw error;
  }
}

export async function processCampaignCalls(campaignId: string) {
  try {
    logger.info(`Starting campaign calls for campaign: ${campaignId}`);
    
    // Get campaign contacts
    const contactsRef = collection(db, `campaigns/${campaignId}/contacts`);
    const contactsSnapshot = await getDocs(contactsRef);
    const contacts = contactsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Update campaign status to 'in-progress'
    const campaignRef = doc(db, 'campaigns', campaignId);
    await updateDoc(campaignRef, { status: 'in-progress' });

    let callCount = 0;
    
    for (const contact of contacts) {
      if (!contact.called) {
        try {
          // Make the call
          await makeCall(contact.phone_number, contact.name || '');
          
          // Update contact status
          const contactRef = doc(db, `campaigns/${campaignId}/contacts`, contact.id);
          await updateDoc(contactRef, {
            called: true,
            called_at: new Date().toISOString()
          });

          // Update campaign stats
          await updateDoc(campaignRef, {
            contacts_called: (callCount + 1)
          });

          callCount++;

          // Wait 1 second between calls
          await sleep(1000);

          // If we've made 10 calls, wait for 10 seconds
          if (callCount % 10 === 0) {
            logger.info('Pausing for 10 seconds after 10 calls');
            await sleep(10000);
          }
        } catch (error) {
          logger.error(`Error processing call for contact ${contact.id}:`, error);
          continue; // Continue with next contact even if one fails
        }
      }
    }

    // Update campaign status to completed
    await updateDoc(campaignRef, {
      status: 'completed',
      completed_at: new Date().toISOString()
    });

    logger.info(`Campaign ${campaignId} completed. Total calls made: ${callCount}`);
  } catch (error) {
    logger.error('Error processing campaign:', error);
    throw error;
  }
}