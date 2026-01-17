# Ticket Audit Script - Example Output

## Usage

```bash
npm run audit:ticket -- <ticket-uuid>
```

## Example Output Structure

### Successful Ticket (All Steps Completed)

```json
{
  "ticketId": "1536aad7-fc68-4703-afaf-6168c45b6a6a",
  "ticketNumber": 9111450,
  "ticketStatus": "closed",
  "workshopName": "Unknown workshop",
  "employeeName": "Unknown Operator",
  "jifelineCustomersEndpointStatus": "404",
  "processedTicketRow": {
    "status": "success",
    "certificateUrl": "https://roacrgpbwlpgciqfykcv.supabase.co/storage/v1/object/public/certificates/9111450-1536aad7-fc68-4703-afaf-6168c45b6a6a.pdf",
    "errorMessage": null,
    "processedAt": "2025-12-16T18:00:00.000Z"
  },
  "pdf": {
    "foundInStorage": true,
    "storagePath": "9111450-1536aad7-fc68-4703-afaf-6168c45b6a6a.pdf",
    "publicUrl": "https://roacrgpbwlpgciqfykcv.supabase.co/storage/v1/object/public/certificates/9111450-1536aad7-fc68-4703-afaf-6168c45b6a6a.pdf"
  },
  "certificateData": {
    "vehicleMake": "KIA",
    "vehicleModel": "EV6",
    "vehicleRegistration": "AB12 CDE",
    "vehicleMileage": "45000 miles",
    "jobNumber": 9111450,
    "date": "2025-12-15",
    "time": "14:30:00"
  },
  "consistencyChecks": {
    "ticketVsProcessed": "ok",
    "pdfVsProcessed": "ok",
    "notes": [
      "Customer endpoint returned 404 (expected with current permissions)"
    ]
  }
}
```

### Failed Ticket (Processing Error)

```json
{
  "ticketId": "fc2a1717-1234-5678-9abc-def012345678",
  "ticketNumber": 9115103,
  "ticketStatus": "closed",
  "workshopName": null,
  "employeeName": null,
  "jifelineCustomersEndpointStatus": "404",
  "processedTicketRow": {
    "status": "failed",
    "certificateUrl": null,
    "errorMessage": "PDF/Storage error: Failed to upload certificate PDF to bucket certificates",
    "processedAt": "2025-12-16T15:41:54.000Z"
  },
  "pdf": {
    "foundInStorage": false,
    "storagePath": "9115103-fc2a1717-1234-5678-9abc-def012345678.pdf",
    "publicUrl": null
  },
  "certificateData": null,
  "consistencyChecks": {
    "ticketVsProcessed": "ok",
    "pdfVsProcessed": "ok",
    "notes": [
      "Customer endpoint returned 404 (expected with current permissions)",
      "CertificateData build failed: Client error: 400 Bad Request"
    ]
  }
}
```

### Needs Review Ticket (Data Validation Issue)

```json
{
  "ticketId": "abc12345-6789-0123-4567-890abcdef012",
  "ticketNumber": 9112000,
  "ticketStatus": "closed",
  "workshopName": null,
  "employeeName": null,
  "jifelineCustomersEndpointStatus": "404",
  "processedTicketRow": {
    "status": "needs_review",
    "certificateUrl": null,
    "errorMessage": "[CUSTOMER_NOT_FOUND] Customer not found: 224f7381-1d28-40fc-94ce-f865f133b6e6",
    "processedAt": "2025-12-16T15:45:45.889Z"
  },
  "pdf": {
    "foundInStorage": false,
    "storagePath": "9112000-abc12345-6789-0123-4567-890abcdef012.pdf",
    "publicUrl": null
  },
  "certificateData": null,
  "consistencyChecks": {
    "ticketVsProcessed": "ok",
    "pdfVsProcessed": "ok",
    "notes": [
      "Customer endpoint returned 404 (expected with current permissions)",
      "Note: Customer 404 is expected with current permissions - fallback values will be used"
    ]
  }
}
```

### Unprocessed Ticket (No Database Record)

```json
{
  "ticketId": "new-ticket-1234-5678-9abc-def012345678",
  "ticketNumber": 9119999,
  "ticketStatus": "closed",
  "workshopName": "Test Workshop",
  "employeeName": "John Doe",
  "jifelineCustomersEndpointStatus": "ok",
  "processedTicketRow": null,
  "pdf": {
    "foundInStorage": false,
    "storagePath": "9119999-new-ticket-1234-5678-9abc-def012345678.pdf",
    "publicUrl": null
  },
  "certificateData": {
    "vehicleMake": "BMW",
    "vehicleModel": "320d",
    "vehicleRegistration": "XY23 FGH",
    "vehicleMileage": "78000 miles",
    "jobNumber": 9119999,
    "date": "2025-12-16",
    "time": "10:00:00"
  },
  "consistencyChecks": {
    "ticketVsProcessed": "missing",
    "pdfVsProcessed": "missing",
    "notes": [
      "No processed_tickets record found for this ticket"
    ]
  }
}
```

## Field Descriptions

### Top-Level Fields

- **`ticketId`**: Jifeline ticket UUID
- **`ticketNumber`**: Human-readable ticket number
- **`ticketStatus`**: Ticket state from Jifeline (e.g., "closed", "prepared")
- **`workshopName`**: Workshop name from certificate data (or fallback "Unknown workshop")
- **`employeeName`**: Employee name from certificate data (or fallback "Unknown Operator")
- **`jifelineCustomersEndpointStatus`**: Status of customer endpoint test
  - `"ok"`: Customer endpoint accessible
  - `"404"`: Customer endpoint returns 404 (expected with current permissions)
  - `"error"`: Other error accessing customer endpoint

### `processedTicketRow`

- **`status`**: Processing status (`"success"`, `"failed"`, `"needs_review"`)
- **`certificateUrl`**: Public URL of uploaded PDF (null if not uploaded)
- **`errorMessage`**: Error message if processing failed (null if successful)
- **`processedAt`**: Timestamp when processing completed

### `pdf`

- **`foundInStorage`**: Whether PDF file exists in Supabase Storage
- **`storagePath`**: Expected file path in storage bucket
- **`publicUrl`**: Public URL to access PDF (null if not found)

### `certificateData`

Rebuilt certificate data showing what the system thinks the certificate should contain:
- **`vehicleMake`**: Vehicle make
- **`vehicleModel`**: Vehicle model
- **`vehicleRegistration`**: Extracted registration (null if not found)
- **`vehicleMileage`**: Extracted mileage (null if not found)
- **`jobNumber`**: Job/ticket number
- **`date`**: Certificate date
- **`time`**: Certificate time

### `consistencyChecks`

- **`ticketVsProcessed`**: 
  - `"ok"`: Ticket number matches between Jifeline and database
  - `"mismatch"`: Ticket numbers don't match
  - `"missing"`: No processed_tickets record found
- **`pdfVsProcessed`**: 
  - `"ok"`: PDF storage status matches database record
  - `"mismatch"`: PDF exists but DB says it doesn't (or vice versa)
  - `"missing"`: No processed_tickets record to compare against
- **`notes`**: Array of diagnostic notes explaining any issues or expected behaviors

## Use Cases

### 1. Debugging Failed Processing
```bash
npm run audit:ticket -- <failed-ticket-uuid> | jq '.processedTicketRow.errorMessage'
```

### 2. Verify PDF Upload
```bash
npm run audit:ticket -- <ticket-uuid> | jq '.pdf.foundInStorage'
```

### 3. Check Certificate Data
```bash
npm run audit:ticket -- <ticket-uuid> | jq '.certificateData'
```

### 4. Compliance/Insurer Review
```bash
npm run audit:ticket -- <ticket-uuid> > audit-report.json
# Provides complete audit trail in machine-readable format
```

### 5. Batch Audit
```bash
for uuid in $(cat ticket-uuids.txt); do
  npm run audit:ticket -- "$uuid" >> batch-audit.jsonl
done
```

## Error Handling

The audit script is **read-only** and handles errors gracefully:
- If ticket not found: Returns partial report with error in `notes`
- If database query fails: Returns partial report with database error in `notes`
- If storage check fails: Returns partial report with storage error in `notes`
- If CertificateData build fails: Returns partial report with build error in `notes`

All errors are captured in the `consistencyChecks.notes` array for comprehensive diagnostics.

