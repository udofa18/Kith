import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!stripe) {
    return res.status(500).json({ error: 'Stripe not configured' });
  }

  const { componentId, title, price, buyerUid } = req.body;

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: title,
            },
            unit_amount: Math.round(price * 100),
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.APP_URL || 'http://localhost:3000'}/success?session_id={CHECKOUT_SESSION_ID}&componentId=${componentId}`,
      cancel_url: `${process.env.APP_URL || 'http://localhost:3000'}/components/${componentId}`,
      metadata: {
        componentId,
        buyerUid,
      },
    });

    res.json({ id: session.id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
