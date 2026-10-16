# HarvestPro NZ — Public REST API Reference (v1)

> **Status (Oct 2026): not usable yet.** The `api-v1` Edge Function exists, but no migration creates the `api_keys` table it authenticates against, so every request fails. The design below is the intended contract.

## Base URL

```
https://<project-ref>.supabase.co/functions/v1/api-v1
```

## Authentication

All requests require a Bearer token using an API key generated from the HarvestPro settings.

```bash
curl -H "Authorization: Bearer hpnz_<your-key>" \
     https://your-project.supabase.co/functions/v1/api-v1/orchards
```

API keys are scoped — each key can only access the orchard it was created for.

## Scopes

| Scope             | Description                        |
| ----------------- | ---------------------------------- |
| `harvest:read`    | View bucket records and bin counts |
| `harvest:write`   | Create bucket records via API      |
| `payroll:read`    | View payroll summaries and rates   |
| `payroll:export`  | Trigger Xero/PaySauce exports      |
| `attendance:read` | View check-in/out records          |
| `bins:read`       | View bin inventory and logistics   |
| `qc:read`         | View quality inspection results    |
| `mpi:export`      | Generate MPI traceability reports  |

## Endpoints

### `GET /orchards`

**Scope**: any  
**Response**: List of accessible orchards

```json
[
  {
    "id": "uuid",
    "name": "JP Cherries Cromwell",
    "total_rows": 200,
    "crop_type": "cherry"
  }
]
```

### `GET /orchards/:id/harvest`

**Scope**: `harvest:read`  
**Response**: Today's harvest data

```json
{
  "date": "2026-03-19",
  "total_buckets": 342,
  "records": [
    {
      "id": "uuid",
      "picker_id": "uuid",
      "scanned_at": "2026-03-19T08:14:22Z",
      "quality_grade": "A",
      "row_number": 15,
      "bin_id": "BIN-001"
    }
  ]
}
```

### `GET /orchards/:id/attendance`

**Scope**: `attendance:read`  
**Response**: Today's attendance records

```json
{
  "date": "2026-03-19",
  "total_checked_in": 45,
  "records": [
    {
      "picker_id": "uuid",
      "date": "2026-03-19",
      "check_in_time": "06:30:00",
      "check_out_time": null
    }
  ]
}
```

### `GET /orchards/:id/payroll`

**Scope**: `payroll:read`  
**Response**: Today's payroll summary

```json
{
  "date": "2026-03-19",
  "piece_rate": 3.5,
  "total_pickers": 45,
  "total_buckets": 342,
  "total_gross": 1197.0,
  "pickers": [
    {
      "picker_id": "uuid",
      "bucket_count": 87,
      "gross_pay": 304.5,
      "piece_rate": 3.5
    }
  ]
}
```

## Rate Limits

- 100 requests/minute per API key
- 10,000 requests/day per API key

## Error Responses

```json
{
  "error": "Invalid or expired API key"
}
```

| Status | Meaning                 |
| ------ | ----------------------- |
| 401    | Invalid/expired API key |
| 403    | Scope not authorized    |
| 404    | Route not found         |
| 429    | Rate limit exceeded     |
| 500    | Internal server error   |
