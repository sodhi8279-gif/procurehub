# RGS Infra ProcureHub

Developed by **SS Sodhi** for RGS Infra.

Procurement and inventory software for multi-site water supply and sewerage projects:
site demand → pre-check → approval → RFQ → comparative → PO → HQ store / direct-to-site /
job worker → receipt → dispatch → site confirmation, with GST billing from the HQ store.

Version **5.7.1**.

## Build (Go 1.24+, no other dependencies)

    Windows: CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "-s -w" -o RGS-ProcureHub.exe .
    Linux:   CGO_ENABLED=0 GOOS=linux   GOARCH=amd64 go build -trimpath -ldflags "-s -w" -o procurehub-linux .
    Mac:     CGO_ENABLED=0 GOOS=darwin  GOARCH=arm64 go build -trimpath -ldflags "-s -w" -o procurehub-mac .

The web app in `web/` is embedded into the program at build time.

## Layout

- `main.go` – server, storage (single JSON database with atomic writes), sync and write API
- `perms.go`, `precheck.go` – HQ permissions and demand pre-check rules
- `gst.go` – HQ store GST challans / tax invoices, site receipt rules
- `jobwork.go` – material with job workers (balance checks, Excel sheets)
- `backup.go`, `xlsx.go` – Excel backup
- `install*.go`, `firewall*.go` – Windows update takeover and firewall setup
- `web/` – browser app (views, modals, actions, job work)
- `deploy/` – setup guide, Windows network fix, Linux service file

Data lives in `ProcureHub-Data/` next to the program and is never part of this repository.
