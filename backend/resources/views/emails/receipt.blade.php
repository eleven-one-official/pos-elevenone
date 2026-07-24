<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>Receipt {{ $order->order_number }}</title>
</head>
<body style="margin:0;padding:24px;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
    <div style="max-width:420px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:24px;">
        <h1 style="margin:0;font-size:20px;text-align:center;">{{ $storeName }}</h1>
        @if ($storeAddress)
            <p style="margin:4px 0 0;font-size:12px;color:#6b7280;text-align:center;">{{ $storeAddress }}</p>
        @endif
        @if ($storePhone)
            <p style="margin:2px 0 0;font-size:12px;color:#6b7280;text-align:center;">Tel: {{ $storePhone }}</p>
        @endif

        <hr style="margin:16px 0;border:none;border-top:1px dashed #d1d5db;">

        <table style="width:100%;font-size:13px;color:#374151;" cellpadding="0" cellspacing="0">
            <tr><td>Receipt</td><td align="right"><strong>{{ $order->order_number }}</strong></td></tr>
            <tr><td>Date</td><td align="right">{{ $order->created_at->format('d/m/Y h:i A') }}</td></tr>
            @if ($order->table)
                <tr><td>Table</td><td align="right">{{ $order->table->name }}</td></tr>
            @endif
            @if ($order->customer)
                <tr><td>Customer</td><td align="right">{{ $order->customer->name }}</td></tr>
            @endif
        </table>

        <hr style="margin:16px 0;border:none;border-top:1px dashed #d1d5db;">

        <table style="width:100%;font-size:13px;" cellpadding="4" cellspacing="0">
            {{-- Dishes the kitchen struck off ("not available") were never charged, so they don't print. --}}
            @foreach ($order->items->whereNull('cancelled_at') as $item)
                <tr>
                    <td style="color:#111827;">{{ $item->quantity }} × {{ $item->name }}</td>
                    <td align="right" style="color:#111827;">${{ number_format((float) $item->line_total, 2) }}</td>
                </tr>
            @endforeach
        </table>

        <hr style="margin:16px 0;border:none;border-top:1px dashed #d1d5db;">

        <table style="width:100%;font-size:13px;color:#374151;" cellpadding="2" cellspacing="0">
            <tr><td>Subtotal</td><td align="right">${{ number_format((float) $order->subtotal, 2) }}</td></tr>
            @if ((float) $order->discount > 0)
                <tr><td>Discount</td><td align="right">- ${{ number_format((float) $order->discount, 2) }}</td></tr>
            @endif
            <tr>
                <td style="font-size:15px;font-weight:bold;color:#111827;">Total</td>
                <td align="right" style="font-size:15px;font-weight:bold;color:#111827;">${{ number_format((float) $order->total, 2) }}</td>
            </tr>
        </table>

        @if ($order->payments->isNotEmpty())
            <hr style="margin:16px 0;border:none;border-top:1px dashed #d1d5db;">
            <table style="width:100%;font-size:12px;color:#6b7280;" cellpadding="2" cellspacing="0">
                @foreach ($order->payments as $payment)
                    <tr>
                        <td>{{ ucfirst(str_replace('_', ' ', $payment->method)) }}{{ $payment->status === 'refunded' ? ' (refunded)' : '' }}</td>
                        <td align="right">${{ number_format((float) $payment->amount, 2) }}</td>
                    </tr>
                @endforeach
            </table>
        @endif

        <p style="margin:20px 0 0;font-size:12px;color:#6b7280;text-align:center;">Thank you — see you again!</p>
    </div>
</body>
</html>
