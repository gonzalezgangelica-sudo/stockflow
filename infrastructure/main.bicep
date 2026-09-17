targetScope = 'resourceGroup'

@description('Environment name')
param environmentName string = 'prod'

@description('Azure region')
param location string = resourceGroup().location

@description('App name prefix')
param appPrefix string = 'ssf-stock'

var tags = {
  application: 'stock-analisis'
  environment: environmentName
}

resource plan 'Microsoft.Web/serverfarms@2022-09-01' = {
  name: '${appPrefix}-${environmentName}-plan'
  location: location
  tags: tags
  sku: {
    name: 'B1'
    tier: 'Basic'
  }
  kind: 'linux'
  properties: {
    reserved: true
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: '${appPrefix}-${environmentName}-appi'
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
  }
}

resource kv 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: '${appPrefix}${environmentName}kv'
  location: location
  tags: tags
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
  }
}

resource web 'Microsoft.Web/sites@2022-09-01' = {
  name: '${appPrefix}-${environmentName}-api'
  location: location
  tags: tags
  kind: 'app,linux'
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'PYTHON|3.12'
      appSettings: [
        {
          name: 'APPINSIGHTS_INSTRUMENTATIONKEY'
          value: appInsights.properties.InstrumentationKey
        }
        {
          name: 'SNAPSHOT_HOUR'
          value: '5'
        }
        {
          name: 'TIMEZONE'
          value: 'Europe/Madrid'
        }
      ]
    }
  }
}

resource snapshotTimer 'Microsoft.Web/sites@2022-09-01' = {
  name: '${appPrefix}-${environmentName}-job'
  location: location
  tags: tags
  kind: 'functionapp,linux'
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'PYTHON|3.12'
      appSettings: [
        {
          name: 'FUNCTIONS_WORKER_RUNTIME'
          value: 'python'
        }
        {
          name: 'STOCK_API_URL'
          value: 'https://${web.properties.defaultHostName}/api/snapshots/run'
        }
      ]
    }
  }
}

output webAppName string = web.name
output webAppUrl string = 'https://${web.properties.defaultHostName}'
output keyVaultName string = kv.name
