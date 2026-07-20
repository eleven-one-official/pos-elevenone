<?php

namespace App\Mail;

use App\Models\Order;
use App\Models\Setting;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * The guest's copy of a settled bill. Sent synchronously from the receipt
 * screen; configure MAIL_MAILER (smtp) in .env for real delivery — the local
 * default `log` just writes it to storage/logs.
 */
class ReceiptMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public Order $order)
    {
    }

    public function envelope(): Envelope
    {
        $store = Setting::where('key', 'store_name')->value('value') ?: 'Elevenone Restaurant';

        return new Envelope(subject: "{$store} — Receipt {$this->order->order_number}");
    }

    public function content(): Content
    {
        $settings = Setting::whereIn('key', ['store_name', 'store_address', 'store_phone'])
            ->pluck('value', 'key');

        return new Content(view: 'emails.receipt', with: [
            'order' => $this->order->loadMissing(['items', 'payments', 'customer:id,name', 'table']),
            'storeName' => $settings['store_name'] ?? 'Elevenone Restaurant',
            'storeAddress' => $settings['store_address'] ?? '',
            'storePhone' => $settings['store_phone'] ?? '',
        ]);
    }
}
