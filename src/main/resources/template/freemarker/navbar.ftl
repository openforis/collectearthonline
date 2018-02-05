<style>





@media screen and (max-width: 600px) {


}
</style>
<nav class="navbar navbar-expand-lg navbar-light" style="background-color: white;" id="main-nav">
	<a class="navbar-brand" href="home">    
		<img class= "img-fluid" id="ceo-site-logo" src="${root}/img/ceo-logo.png">
	</a>
      <button class="navbar-toggler" type="button" data-toggle="collapse" data-target="#navbarSupportedContent" aria-controls="navbarSupportedContent" aria-expanded="false" aria-label="Toggle navigation">
    <span class="navbar-toggler-icon"></span>
  </button>
  	<div class="collapse navbar-collapse" id="navbarSupportedContent">
  		<ul class="navbar-nav mr-auto">
        <#list ["Home", "About", "Support"] as url>
            <#if navlink == url>
                <li class="nav-item active">
                		<a class="nav-link" href="${root}/${url?lower_case}">${url}</a>
				</li>
            <#else>
                <li class="nav-item">
                		<a class="nav-link" href="${root}/${url?lower_case}">${url}</a>
                </li>
            </#if>
        </#list>
        <#if username??>
            <#if navlink == "Account">
                <li class="nav-item active">
					<a class="nav-link" href="${root}/account/${userid}">Account</a>
				</li>
            <#else>
                <li class="nav-item">
                		<a  class="nav-link" href="${root}/account/${userid}">Account</a>
                </li>
            </#if>
        </#if>
        </ul>
	      <ul id="login-info" class="navbar-nav mr-0">
        <#if username??>
	            <#if navlink == "Logout">
	            <li class="nav-item">
	            <span class="nav-link disabled">${username}</span> 
	            </li>
   	            <button type="button" class="btn btn-outline-danger btn-sm" onclick="location.href = '${root}/logout'">
           	      Logout
                 </button>	    
	            <#else>
	            <li class="nav-item">
	            <span class="nav-link disabled">${username}</span> 
	            </li>
   	            <button type="button" class="btn btn-outline-danger btn-sm" onclick="location.href = '${root}/logout'">
           	      Logout
                 </button>	    
               </#if>
        <#else>
            <#if navlink == "Login" || navlink == "Register">
	            <button type="button" class="btn bg-lightgreen btn-sm" onclick="location.href = '${root}/login'">
	                Login/Register
                </button>
	            <#else>
	            <button type="button" class="btn bg-lightgreen btn-sm" onclick="location.href = '${root}/login'">
	                Login/Register
                </button>
            </#if>
        </#if>
    </ul>
</nav>
<script>
function menuControls() {
    var x = document.getElementById("myTopnav");
    if (x.className === "topnav") {
        x.className += " responsive";
    } else {
        x.className = "topnav";
    }
    var ml = document.getElementById("mobileLogin");
    if (ml.className === "mobileLogin") {
            ml.className += " responsive";
        } else {
            ml.className = "mobileLogin";
        }
}
</script>