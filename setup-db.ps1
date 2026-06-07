# POS System — Database Setup
# Creates the PostgreSQL databases and user for the POS system
# Run this ONCE before first start

Write-Host "=== POS System - Configuracion de Base de Datos ===" -ForegroundColor Cyan
Write-Host "Este script crea el usuario y las bases de datos necesarias.`n" -ForegroundColor Gray

$pgUser = "pos_user"
$pgPass = "pos_pass"
$pgDbMain = "pos_db"
$pgDbTest = "pos_test_db"

Write-Host "Creando usuario '$pgUser'..." -ForegroundColor Yellow
& psql -U postgres -c "CREATE USER $pgUser WITH PASSWORD '$pgPass';" 2>$null
& psql -U postgres -c "ALTER USER $pgUser CREATEDB;" 2>$null

Write-Host "Creando base de datos '$pgDbMain'..." -ForegroundColor Yellow
& psql -U postgres -c "CREATE DATABASE $pgDbMain OWNER $pgUser;" 2>$null

Write-Host "Creando base de datos de pruebas '$pgDbTest'..." -ForegroundColor Yellow
& psql -U postgres -c "CREATE DATABASE $pgDbTest OWNER $pgUser;" 2>$null

Write-Host "`n[OK] Base de datos configurada." -ForegroundColor Green
Write-Host "  Usuario: $pgUser" -ForegroundColor White
Write-Host "  BD Principal: $pgDbMain" -ForegroundColor White
Write-Host "  BD Pruebas: $pgDbTest" -ForegroundColor White
Write-Host "`nSiguiente paso: ejecuta .\start.ps1`n" -ForegroundColor Cyan
