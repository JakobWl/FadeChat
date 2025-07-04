using Azure.Identity;
using SpillTea.Application.Common.Interfaces;
using SpillTea.Infrastructure.Data;
using SpillTea.Web.Nswag;
using SpillTea.Web.Services;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using NSwag;
using NSwag.Generation.Processors.Security;

namespace SpillTea.Web;

public static class DependencyInjection
{
    public static void AddWebServices(this IHostApplicationBuilder builder)
    {
        builder.Services.AddDatabaseDeveloperPageExceptionFilter();

        builder.Services.AddScoped<IUser, CurrentUser>();

        builder.Services.AddHttpContextAccessor();
        builder.Services.AddHealthChecks()
            .AddDbContextCheck<ApplicationDbContext>();

        builder.Services.AddExceptionHandler<CustomExceptionHandler>();

        // Add distributed caching (Redis or in-memory fallback)
        var redisConnectionString = builder.Configuration.GetConnectionString("Redis");
        if (!string.IsNullOrEmpty(redisConnectionString))
        {
            builder.Services.AddStackExchangeRedisCache(options =>
            {
                options.Configuration = redisConnectionString;
            });
        }
        else
        {
            builder.Services.AddDistributedMemoryCache();
        }

        // Add SignalR
        builder.Services.AddSignalR();

        // Configure Authentication
        builder.Services.AddAuthentication(opt =>
            {
                opt.DefaultScheme = IdentityConstants.ApplicationScheme;
                opt.DefaultAuthenticateScheme = IdentityConstants.ApplicationScheme;
                opt.DefaultChallengeScheme = IdentityConstants.ApplicationScheme;
                opt.DefaultSignInScheme = IdentityConstants.ApplicationScheme;
            })
            .AddGoogle(options =>
            {
                options.ClientId = builder.Configuration["Authentication:Google:ClientId"]!;
                options.ClientSecret = builder.Configuration["Authentication:Google:ClientSecret"]!;
                options.SignInScheme = IdentityConstants.ExternalScheme;
            })
            .AddFacebook(options =>
            {
                options.AppId = builder.Configuration["Authentication:Facebook:AppId"]!;
                options.AppSecret = builder.Configuration["Authentication:Facebook:AppSecret"]!;
                options.SignInScheme = IdentityConstants.ExternalScheme;
            });

        builder.Services.AddCors(options =>
        {
            options.AddDefaultPolicy(configurePolicy =>
            {
                configurePolicy
                    .WithOrigins(builder.Configuration.GetSection("CorsOrigins").Get<string[]>() ?? [])
                    .AllowAnyHeader()
                    .AllowAnyMethod()
                    .AllowCredentials();
            });
        });

        // Customise default API behaviour
        builder.Services.Configure<ApiBehaviorOptions>(options =>
            options.SuppressModelStateInvalidFilter = true);

        builder.Services.AddEndpointsApiExplorer();

        builder.Services.AddOpenApiDocument((configure, _) =>
        {
            configure.Title = "SpillTea API";
            configure.AddSecurity("oauth2", new OpenApiSecurityScheme {
                Type = OpenApiSecuritySchemeType.OAuth2,
                Flows = new OpenApiOAuthFlows {
                    AuthorizationCode = new OpenApiOAuthFlow {
                        AuthorizationUrl = $"{builder.Configuration["Authentication:OIDC:Authority"]}/connect/authorize",
                        TokenUrl = $"{builder.Configuration["Authentication:OIDC:Authority"]}/connect/token",
                        Scopes = new Dictionary<string, string> {
                            {
                                "openid", "OpenID"
                            }, {
                                "profile", "Profile"
                            }, {
                                "email", "Email"
                            }
                        }
                    }
                }
            });
            configure.OperationProcessors.Add(new AspNetCoreOperationSecurityScopeProcessor("oauth2"));
            configure.SchemaSettings.SchemaProcessors.Add(new NonNullableToRequiredSchemaProcessor());
        });
    }

    public static void AddKeyVaultIfConfigured(this IHostApplicationBuilder builder)
    {
        var keyVaultUri = builder.Configuration["AZURE_KEY_VAULT_ENDPOINT"];
        if (!string.IsNullOrWhiteSpace(keyVaultUri))
        {
            builder.Configuration.AddAzureKeyVault(
                new Uri(keyVaultUri),
                new DefaultAzureCredential());
        }
    }
}
