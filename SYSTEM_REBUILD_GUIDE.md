# Complete System Rebuild Guide

This guide will help you rebuild the entire ProcureFlow system with detailed logging so you understand exactly what's happening at each step.

---

## Quick Reference

| Script | Purpose | When to Use |
|--------|---------|-------------|
| `check-system.ps1` | Check status of all services | Before starting, to see what's running |
| `rebuild-frontend.ps1` | Rebuild only frontend | When frontend code changes |
| `rebuild-all.ps1` | Rebuild everything | Fresh start or major changes |

---

## Step-by-Step: Complete System Rebuild

### **Step 1: Check Current Status**

```powershell
.\check-system.ps1
```

**What this does:**
- ✅ Checks if Docker is running
- ✅ Lists all containers and their status
- ✅ Verifies infrastructure (PostgreSQL, Redis, Kafka, etc.)
- ✅ Tests agent health endpoints
- ✅ Shows recent logs from each agent
- ✅ Displays quick access URLs

**Look for:**
- Green ✓ marks = Good
- Red ✗ marks = Problem
- Yellow ⚠ marks = Warning (may be OK)

---

### **Step 2: Rebuild Backend (If Needed)**

If agents need rebuilding (you changed Python code):

```powershell
# Stop containers
docker-compose down

# Rebuild Agent 1 (has new industry check code)
docker-compose build agent1-ocr

# Start infrastructure first (wait 30s)
docker-compose up -d postgres mysql redis zookeeper kafka minio

# Wait...
Start-Sleep -Seconds 30

# Start services
docker-compose up -d api-gateway ocr-service inventory-service vendor-service procurement-service onboarding-service

# Start agents
docker-compose up -d agent1-ocr agent2-inventory agent3-vendor agent4-procurement
```

**Or use the complete rebuild script:**

```powershell
.\rebuild-all.ps1
```

This will:
1. Stop all containers
2. Rebuild Agent 1 with new code
3. Start infrastructure and wait
4. Start all services
5. Start all agents
6. Verify everything is running
7. Automatically rebuild frontend
8. Start frontend dev server

---

### **Step 3: Rebuild Frontend Only**

If you only changed frontend code:

```powershell
.\rebuild-frontend.ps1
```

**What this does:**

```
[STEP 1/7] Navigate to frontend directory
[STEP 2/7] Check if node_modules exists
[STEP 3/7] Install dependencies (npm install)
[STEP 4/7] Clean Next.js cache (.next directory)
[STEP 5/7] Verify new component files exist:
            ✓ WorkflowView.tsx
            ✓ api.ts updates
            ✓ globals.css updates
[STEP 6/7] Build Next.js (npm run build)
[STEP 7/7] Start dev server (npm run dev)
```

**Expected output:**
- Green ✓ for each successful step
- Red ✗ if something fails
- Build time: ~2-3 minutes
- Server starts on http://localhost:3000

---

## Understanding the Logs

### **Docker Container Logs**

View logs for any container:

```powershell
# View last 50 lines
docker logs procurement_agent1 --tail 50

# Follow logs in real-time
docker logs -f procurement_agent1

# View logs from multiple agents
docker-compose logs -f agent1-ocr agent2-inventory agent3-vendor agent4-procurement
```

---

### **Agent 1 (OCR) Key Log Messages**

```
✅ GOOD:
"Kafka consumer thread started"
"Kafka consumer connected, waiting for messages..."
"Processing complete for {id}, request_id={id}"

⚠ WARNING:
"Could not detect industry for '{item}', defaulting to construction"

❌ ERROR:
"Industry '{industry}' is not connected — skipping item"
"Processing failed for {id}: {error}"
```

---

### **Agent 2, 3, 4 Key Log Messages**

```
✅ GOOD:
"Kafka consumer started on {topic}"
"Received event: request_id={id}"
"Published {result} for request {id} → {topic}"

⚠ WARNING:
"No vendors found for {item}"
"Cache read error: {error}"

❌ ERROR:
"Error processing event: {error}"
"Kafka consumer failed: {error}"
```

---

### **Frontend Build Logs**

```
✅ GOOD:
"Compiled successfully"
"Ready on http://localhost:3000"
"○ (Static) automatically rendered as static HTML"

⚠ WARNING:
"Warning: {warning message}"
(Usually safe to ignore)

❌ ERROR:
"Module not found: Can't resolve '{file}'"
"Unexpected token"
"Build failed"
```

---

## Troubleshooting Guide

### **Problem: Frontend shows "Coming soon" on Workflows page**

**Cause:** Frontend not rebuilt after code changes

**Solution:**
```powershell
cd frontend
Remove-Item -Path ".next" -Recurse -Force
npm install
npm run build
npm run dev
```

---

### **Problem: "No databases connected" error**

**Cause:** Industries not connected in Data Sources

**Solution:**
1. Go to http://localhost:3000/data-sources
2. Connect at least one industry (e.g., manufacturing)
3. Try uploading invoice again

---

### **Problem: Agent 1 Kafka consumer not starting**

**Cause:** Kafka not ready or connection failed

**Check:**
```powershell
# Check Kafka is running
docker logs procurement_kafka --tail 50

# Restart Agent 1
docker restart procurement_agent1

# Check logs
docker logs procurement_agent1 --tail 100
```

**Look for:**
```
"Kafka consumer connected, waiting for messages..."
```

---

### **Problem: Agents show "offline" in UI**

**Cause:** Agent containers not running or health endpoints failing

**Check:**
```powershell
# Check container status
docker ps | Select-String "agent"

# Test health endpoints
curl http://localhost:8005/health
curl http://localhost:8006/health
curl http://localhost:8008/health
```

**Solution:**
```powershell
# Restart specific agent
docker restart procurement_agent2

# Or restart all agents
docker restart procurement_agent1 procurement_agent2 procurement_agent3 procurement_agent4
```

---

### **Problem: Build fails with "Module not found"**

**Cause:** Dependencies not installed or corrupted

**Solution:**
```powershell
cd frontend
Remove-Item -Path "node_modules" -Recurse -Force
Remove-Item -Path "package-lock.json" -Force
npm install
npm run build
```

---

## Verification Checklist

After rebuild, verify these:

### **Backend:**
- [ ] ✅ All containers running: `docker ps`
- [ ] ✅ Agent 1 Kafka consumer connected
- [ ] ✅ Agents 2, 3, 4 show "running" status
- [ ] ✅ Can access http://localhost:8009/health
- [ ] ✅ Can access http://localhost:8005/status
- [ ] ✅ Can access http://localhost:8006/status
- [ ] ✅ Can access http://localhost:8008/status

### **Frontend:**
- [ ] ✅ Build completed without errors
- [ ] ✅ Dev server running on http://localhost:3000
- [ ] ✅ Agent Monitor page loads
- [ ] ✅ Agent Logs page loads
- [ ] ✅ **Workflows page shows tracker (NOT "Coming soon")**
- [ ] ✅ Can see live agent status cards
- [ ] ✅ Can select and track requests

### **Integration:**
- [ ] ✅ Upload invoice succeeds
- [ ] ✅ Request appears in database
- [ ] ✅ Agents process automatically
- [ ] ✅ Can see events in Agent Logs
- [ ] ✅ Can track request in Workflows page
- [ ] ✅ Purchase orders created

---

## Quick Commands Cheat Sheet

```powershell
# Check everything
.\check-system.ps1

# Rebuild everything
.\rebuild-all.ps1

# Rebuild frontend only
.\rebuild-frontend.ps1

# Stop all containers
docker-compose down

# Start all containers
docker-compose up -d

# View logs
docker logs procurement_agent1 --tail 50
docker logs -f procurement_agent1

# Restart agent
docker restart procurement_agent1

# Check container status
docker ps

# Access frontend
http://localhost:3000

# Test agent health
curl http://localhost:8009/health
```

---

## What Each Script Does

### **check-system.ps1**

**10 Comprehensive Checks:**
1. Docker engine status
2. Container status (all procurement containers)
3. Infrastructure services (PostgreSQL, MySQL, Redis, Kafka, MinIO)
4. Agent containers (1, 2, 3, 4)
5. Agent 1 Kafka consumer thread
6. Agent health endpoints
7. Agent status (events processed)
8. Backend services
9. Database connections
10. Frontend status

**Plus:**
- Shows recent logs from each agent (last 5 lines)
- Displays all important URLs
- Color-coded output (green = good, red = error, yellow = warning)

---

### **rebuild-frontend.ps1**

**7-Step Process:**
1. Navigate to frontend directory
2. Check dependencies
3. Install/update npm packages
4. Clean Next.js cache
5. Verify new component files exist
6. Build Next.js application
7. Start development server

**Features:**
- Progress indicators for each step
- Detailed error messages
- Build time estimates
- Automatic component verification

---

### **rebuild-all.ps1**

**Complete System Rebuild:**

**Phase 1: Backend (8 steps)**
1. Stop all containers
2. Rebuild Agent 1 with new code
3. Start infrastructure + 30s wait
4. Start backend services + 10s wait
5. Start all agents + 15s wait
6. Verify container status
7. Check Agent 1 Kafka consumer
8. Test agent health endpoints

**Phase 2: Frontend**
- Automatically runs `rebuild-frontend.ps1`
- Complete frontend rebuild
- Starts dev server

---

## Expected Timelines

| Task | Duration |
|------|----------|
| Check system status | 10-15 seconds |
| Stop containers | 5-10 seconds |
| Rebuild Agent 1 | 30-60 seconds |
| Start infrastructure | 30 seconds (with wait) |
| Start services | 10 seconds (with wait) |
| Start agents | 15 seconds (with wait) |
| Frontend npm install | 30-60 seconds |
| Frontend build | 60-120 seconds |
| Total rebuild time | **4-6 minutes** |

---

## Success Indicators

When everything is working:

**Terminal Output:**
```
✓ All containers running
✓ Agent 1 Kafka consumer connected
✓ Agents 2, 3, 4 showing "running"
✓ All health checks passing
✓ Frontend build successful
✓ Dev server running on http://localhost:3000
```

**Browser:**
- Agent Monitor shows 3 live agent cards
- Agent Logs shows event history
- **Workflows shows request tracker (NOT "Coming soon")**
- Can upload and track invoices

**Database:**
- Connected industries visible in Data Sources
- Requests being created
- Events logged in procurement_events table
- Purchase orders created

---

## Support

If rebuild fails:

1. **Run check script first:**
   ```powershell
   .\check-system.ps1
   ```

2. **Check specific logs:**
   ```powershell
   docker logs procurement_agent1 --tail 100
   ```

3. **Try nuclear option:**
   ```powershell
   docker-compose down -v
   docker-compose up -d --build
   ```

4. **Check for port conflicts:**
   ```powershell
   netstat -ano | findstr :3000
   netstat -ano | findstr :8009
   ```

---

**Remember:** The detailed logs from these scripts will tell you exactly what's happening at each step!
