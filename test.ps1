# create-object.ps1

$baseUrl = "http://localhost:3002"
$endpoint = "$baseUrl/create_object"

$body = @{
    seed               = "----------------------------"
    network            = "testnet"
    creditToken        = "0x2e2032cf7e3b03a12c66cc472502e4e23cf086fad7528431c16390efce045879"
    OIDcontrollerCap   = "0x4b6de58f442533741c9f18c76672d4741de70ecceac4b71fb620048d4d6d4785"
    object_type        = "document"
    product_url        = "https://nxc.technology/"
    product_img_url    = "https://nxc.technology/"
    description        = "test book SDV"
    op_code            = ""
    immutable_metadata = @{}   # {} lato JSON
    mutable_metadata   = @{}   # {} lato JSON
    geo_location       = ""
}

$jsonBody = $body | ConvertTo-Json -Depth 5

Write-Host "POST $endpoint"
Write-Host "Body:" $jsonBody

try {
    $response = Invoke-RestMethod -Uri $endpoint -Method Post -Body $jsonBody -ContentType "application/json"
    Write-Host "Response:"
    $response | ConvertTo-Json -Depth 10
}
catch {
    Write-Host "Request failed:"
    Write-Host $_.Exception.Message
    if ($_.Exception.Response) {
        $respStream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($respStream)
        $respBody = $reader.ReadToEnd()
        Write-Host "Response body:"
        Write-Host $respBody
    }
}
