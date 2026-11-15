param (
    [string]$ApiUrl = "http://localhost:3001"
)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "☕ BrewLite - Chạy End-to-End (E2E) Test Suite" -ForegroundColor Cyan
Write-Host "Mục tiêu API: $ApiUrl" -ForegroundColor Yellow
Write-Host "=========================================================="

# Kiểm tra kết nối trước khi chạy
Write-Host "Đang kiểm tra kết nối tới $ApiUrl/health..." -ForegroundColor Gray

try {
    $health = Invoke-RestMethod -Uri "$ApiUrl/health" -Method Get -TimeoutSec 5 -ErrorAction Stop
    if ($health.status -eq "ok") {
        Write-Host "✅ Kết nối API thành công (status: ok)" -ForegroundColor Green
    } else {
        Write-Host "⚠️ Phản hồi từ /health không như mong đợi: $($health | ConvertTo-Json)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Không thể kết nối tới API tại $ApiUrl" -ForegroundColor Red
    Write-Host ""
    Write-Host "Hướng dẫn khắc phục:" -ForegroundColor Yellow
    Write-Host "1. Nếu chạy local: Hãy mở cửa sổ PowerShell khác và khởi động API:" -ForegroundColor White
    Write-Host "   cd apps/api" -ForegroundColor Gray
    Write-Host "   npm.cmd run start:dev" -ForegroundColor Gray
    Write-Host ""
    Write-Host "2. Nếu kiểm thử trên production (Render):" -ForegroundColor White
    Write-Host "   .\tests\run-e2e.ps1 -ApiUrl https://brewlite-api.onrender.com" -ForegroundColor Gray
    Write-Host ""
    exit 1
}

Write-Host ""
Write-Host "Đang thực thi E2E Test Suite (Node.js Test Runner)..." -ForegroundColor Cyan
Write-Host ""

$env:API_URL = $ApiUrl
node --test tests/e2e-order-flow.test.mjs

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "🎉 TẤT CẢ CÁC BÀI TEST E2E ĐÃ VƯỢT QUA THÀNH CÔNG!" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "❌ E2E TEST THẤT BẠI. Vui lòng kiểm tra log lỗi ở trên." -ForegroundColor Red
}

exit $LASTEXITCODE

